-- DCC CMS: identity, academic structure, students and access-control helpers.
create extension if not exists btree_gist;
create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

create type public.tier as enum ('higher_secondary', 'undergraduate', 'postgraduate');
create type public.app_role as enum (
  'super_admin', 'management', 'principal', 'exam_cell',
  'faculty', 'office_staff', 'lab_technician', 'parent', 'student'
);
create type public.student_status as enum ('active', 'suspended', 'graduated', 'alumni');
create type public.residential_category as enum ('day_scholar', 'hostel', 'other');
create type public.course_category as enum (
  'core', 'major', 'minor', 'skill_enhancement', 'value_added', 'lab_practical',
  'elective', 'specialization', 'seminar', 'thesis', 'class_group'
);

create function app.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  email text,
  phone text,
  role public.app_role not null,
  department_id uuid references public.departments (id) on delete set null,
  is_hod boolean not null default false,
  -- Office staff and lab technicians are limited to these tiers. Empty = none.
  tiers public.tier[] not null default '{}',
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
create index profiles_department_idx on public.profiles (department_id);
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- Maps roll numbers, staff IDs, and mobile numbers to Supabase Auth users.
-- Read only by the server (service role) during sign-in.
create table public.login_identifiers (
  portal text not null check (portal in ('institutional', 'staff', 'parent', 'student')),
  identifier text not null check (identifier = lower(trim(identifier)) and identifier <> ''),
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (portal, identifier)
);
create index login_identifiers_user_idx on public.login_identifiers (user_id);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  check (ends_on > starts_on)
);
create unique index academic_years_one_current on public.academic_years (is_current) where is_current;

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  tier public.tier not null,
  code text not null unique,
  name text not null,
  department_id uuid references public.departments (id) on delete set null,
  total_terms smallint not null check (total_terms between 1 and 12)
);
create index programs_tier_idx on public.programs (tier);

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  tier public.tier not null,
  term_no smallint not null check (term_no between 1 and 12),
  label text not null,
  starts_on date not null,
  ends_on date not null,
  check (ends_on > starts_on),
  unique (academic_year_id, tier, term_no)
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  tier public.tier not null,
  program_id uuid references public.programs (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  code text not null unique,
  title text not null,
  category public.course_category not null default 'core',
  credits numeric(4,1) not null default 0 check (credits >= 0)
);
create index courses_tier_idx on public.courses (tier);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  term_id uuid not null references public.terms (id) on delete restrict,
  name text not null default 'A',
  tier public.tier not null,
  unique (course_id, term_id, name)
);
create index sections_term_idx on public.sections (term_id);

create table public.faculty_assignments (
  faculty_id uuid not null references public.profiles (id) on delete cascade,
  section_id uuid not null references public.sections (id) on delete cascade,
  primary key (faculty_id, section_id)
);
create index faculty_assignments_section_idx on public.faculty_assignments (section_id);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles (id) on delete set null,
  enrollment_no text not null unique,
  tier public.tier not null,
  program_id uuid references public.programs (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  full_name text not null check (length(trim(full_name)) > 0),
  date_of_birth date,
  gender text,
  phone text,
  email text,
  address text,
  residential_category public.residential_category not null default 'day_scholar',
  photo_path text,
  status public.student_status not null default 'active',
  admitted_on date not null default current_date,
  -- Higher Secondary
  class_level text check (class_level in ('XI', 'XII')),
  stream text check (stream in ('Arts', 'Science', 'Commerce')),
  council_reg_no text unique,
  combination_subjects text[] not null default '{}',
  -- Undergraduate
  degree text,
  major_subject text,
  minor_subject text,
  university_roll_no text unique,
  university_reg_no text unique,
  -- Postgraduate
  specialization text,
  previous_degree text,
  previous_degree_verified boolean not null default false,
  -- UG and PG
  semester smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_tier_fields check (
    (tier = 'higher_secondary' and class_level is not null and stream is not null and semester is null)
    or (tier = 'undergraduate' and degree is not null and major_subject is not null and semester between 1 and 6)
    or (tier = 'postgraduate' and department_id is not null and specialization is not null and semester between 1 and 4)
  )
);
create index students_tier_status_idx on public.students (tier, status);
create index students_program_idx on public.students (program_id);
create index students_name_idx on public.students (lower(full_name));
create trigger students_touch before update on public.students
  for each row execute function app.touch_updated_at();

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles (id) on delete set null,
  full_name text not null,
  relation text not null default 'Guardian',
  phone text not null,
  email text,
  created_at timestamptz not null default now()
);
create unique index guardians_phone_idx on public.guardians (phone);

create table public.student_guardians (
  student_id uuid not null references public.students (id) on delete cascade,
  guardian_id uuid not null references public.guardians (id) on delete cascade,
  is_primary boolean not null default false,
  primary key (student_id, guardian_id)
);
create index student_guardians_guardian_idx on public.student_guardians (guardian_id);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  section_id uuid not null references public.sections (id) on delete restrict,
  course_id uuid not null references public.courses (id) on delete restrict,
  term_id uuid not null references public.terms (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (student_id, course_id, term_id)
);
create index enrollments_section_idx on public.enrollments (section_id);
create index enrollments_term_idx on public.enrollments (term_id);

-- course_id and term_id always come from the section, so clients cannot mismatch them.
create function app.enrollment_fill() returns trigger language plpgsql as $$
begin
  select s.course_id, s.term_id into new.course_id, new.term_id
  from public.sections s where s.id = new.section_id;
  if not found then raise exception 'Unknown section'; end if;
  return new;
end $$;
create trigger enrollments_fill before insert or update on public.enrollments
  for each row execute function app.enrollment_fill();

create table public.student_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  kind text not null check (kind in ('marks_card', 'photo', 'admission_voucher', 'other')),
  storage_path text not null unique,
  file_name text not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index student_documents_student_idx on public.student_documents (student_id);

-- Access helpers. SECURITY DEFINER keeps RLS policies from recursing.
create function app.role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;
create function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.role() in ('super_admin', 'management', 'principal'), false)
$$;
create function app.is_exam_cell() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.role() = 'exam_cell', false)
$$;
create function app.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.role() in ('super_admin', 'management', 'principal', 'exam_cell',
    'faculty', 'office_staff', 'lab_technician'), false)
$$;
create function app.is_office_for(t public.tier) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role = 'office_staff' and t = any (p.tiers))
$$;
create function app.my_student_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.students s
  join public.profiles p on p.id = s.user_id
  where s.user_id = auth.uid() and p.is_active
$$;
create function app.is_guardian_of(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id
    join public.profiles p on p.id = g.user_id
    where sg.student_id = sid and g.user_id = auth.uid() and p.is_active)
$$;
create function app.can_view_student(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select sid = app.my_student_id() or app.is_guardian_of(sid)
$$;
create function app.teaches_section(sec uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.faculty_assignments fa
    join public.profiles p on p.id = fa.faculty_id
    where fa.section_id = sec and fa.faculty_id = auth.uid() and p.is_active)
$$;
create function app.teaches_student(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.enrollments e
    join public.faculty_assignments fa on fa.section_id = e.section_id
    join public.profiles p on p.id = fa.faculty_id
    where e.student_id = sid and fa.faculty_id = auth.uid() and p.is_active)
$$;
create function app.student_tier(sid uuid) returns public.tier
language sql stable security definer set search_path = '' as $$
  select s.tier from public.students s where s.id = sid
$$;
create function app.can_read_student_record(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_admin() or app.is_exam_cell() or app.teaches_student(sid)
    or app.is_office_for(app.student_tier(sid)) or app.can_view_student(sid)
$$;
grant execute on all functions in schema app to authenticated, service_role;

-- Reference tables: readable when signed in, writable only by admins.
do $$
declare t text;
begin
  foreach t in array array['departments','academic_years','programs','terms','courses','sections'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (app.is_admin()) with check (app.is_admin())', t || '_admin', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy profiles_self on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_staff_read on public.profiles for select to authenticated
  using (app.is_staff() and role not in ('parent', 'student'));
create policy profiles_admin on public.profiles for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

alter table public.login_identifiers enable row level security;
create policy login_identifiers_admin on public.login_identifiers for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

alter table public.faculty_assignments enable row level security;
create policy fa_read on public.faculty_assignments for select to authenticated
  using (faculty_id = auth.uid() or app.is_admin() or app.is_exam_cell());
create policy fa_admin on public.faculty_assignments for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

alter table public.students enable row level security;
create policy students_read on public.students for select to authenticated
  using (app.can_read_student_record(id));
create policy students_admin on public.students for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy students_office_insert on public.students for insert to authenticated
  with check (app.is_office_for(tier));
create policy students_office_update on public.students for update to authenticated
  using (app.is_office_for(tier)) with check (app.is_office_for(tier));

alter table public.guardians enable row level security;
create policy guardians_read on public.guardians for select to authenticated using (
  user_id = auth.uid() or app.is_admin() or app.is_exam_cell() or exists (
    select 1 from public.student_guardians sg
    where sg.guardian_id = guardians.id and (app.teaches_student(sg.student_id)
      or app.is_office_for(app.student_tier(sg.student_id)) or sg.student_id = app.my_student_id()))
  or app.role() = 'office_staff');
create policy guardians_admin on public.guardians for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy guardians_office_insert on public.guardians for insert to authenticated
  with check (app.role() = 'office_staff');

alter table public.student_guardians enable row level security;
create policy sg_read on public.student_guardians for select to authenticated
  using (app.can_read_student_record(student_id));
create policy sg_admin on public.student_guardians for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy sg_office on public.student_guardians for insert to authenticated
  with check (app.is_office_for(app.student_tier(student_id)));

alter table public.enrollments enable row level security;
create policy enrollments_read on public.enrollments for select to authenticated using (
  app.is_admin() or app.is_exam_cell() or app.teaches_section(section_id)
  or app.is_office_for(app.student_tier(student_id)) or app.can_view_student(student_id));
create policy enrollments_admin on public.enrollments for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy enrollments_office on public.enrollments for insert to authenticated
  with check (app.is_office_for(app.student_tier(student_id)));

alter table public.student_documents enable row level security;
create policy documents_read on public.student_documents for select to authenticated
  using (app.can_read_student_record(student_id));
create policy documents_write on public.student_documents for all to authenticated
  using (app.is_admin() or app.is_office_for(app.student_tier(student_id)))
  with check (app.is_admin() or app.is_office_for(app.student_tier(student_id)));
