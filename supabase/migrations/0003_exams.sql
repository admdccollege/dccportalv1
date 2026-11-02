-- Module 3: assessments, marks, tier-specific grading, verifiable results.
create type public.assessment_kind as enum (
  'unit_test', 'midterm', 'pre_board', 'practical_record',
  'cia_1', 'cia_2', 'assignment', 'seminar', 'lab_practical', 'semester_end', 'thesis'
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections (id) on delete cascade,
  name text not null,
  kind public.assessment_kind not null,
  max_marks numeric(6,2) not null check (max_marks > 0),
  weightage numeric(5,2) not null default 100 check (weightage > 0),
  exam_date date,
  is_published boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (section_id, name)
);

create table public.marks (
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  marks numeric(6,2) check (marks >= 0),
  is_absent boolean not null default false,
  entered_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (assessment_id, student_id),
  check (not (is_absent and marks is not null))
);
create index marks_student_idx on public.marks (student_id);

create function app.marks_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a public.assessments;
begin
  select * into a from public.assessments x where x.id = new.assessment_id;
  if new.marks is not null and new.marks > a.max_marks then
    raise exception 'Marks % exceed the maximum of %', new.marks, a.max_marks;
  end if;
  if not exists (select 1 from public.enrollments e
      where e.section_id = a.section_id and e.student_id = new.student_id) then
    raise exception 'Student is not enrolled in this section';
  end if;
  new.updated_at := now();
  new.entered_by := coalesce(auth.uid(), new.entered_by);
  return new;
end $$;
create trigger marks_guard before insert or update on public.marks
  for each row execute function app.marks_guard();

-- Default scales. Replace them to match the council or university regulations.
create table public.grade_scales (
  tier public.tier not null,
  letter text not null,
  min_percent numeric(5,2) not null check (min_percent between 0 and 100),
  grade_point numeric(4,2) not null check (grade_point >= 0),
  primary key (tier, letter),
  unique (tier, min_percent)
);
insert into public.grade_scales (tier, letter, min_percent, grade_point)
select t::public.tier, v.letter, v.min_percent, v.grade_point
from unnest(array['undergraduate', 'postgraduate']) t
cross join (values ('O',90,10),('A+',80,9),('A',70,8),('B+',60,7),('B',50,6),('C',45,5),('P',40,4),('F',0,0))
  as v(letter, min_percent, grade_point);

create table public.term_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  term_id uuid not null references public.terms (id) on delete restrict,
  tier public.tier not null,
  percentage numeric(5,2),
  division text,
  sgpa numeric(4,2),
  cgpa numeric(4,2),
  credits_registered numeric(5,1),
  credits_earned numeric(5,1),
  courses jsonb not null default '[]',
  verification_hash text not null unique,
  is_published boolean not null default false,
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  unique (student_id, term_id)
);

create function app.hs_division(pct numeric) returns text language sql immutable as $$
  select case when pct >= 60 then 'First Division'
    when pct >= 45 then 'Second Division'
    when pct >= 30 then 'Third Division' else 'Not Passed' end
$$;

-- Computes and publishes one term of results for one student.
create function public.publish_term_result(p_student uuid, p_term uuid)
returns public.term_results language plpgsql security definer set search_path = '' as $$
declare
  stu public.students;
  rows jsonb;
  pct numeric; sg numeric; cg numeric; reg numeric; earned numeric;
  res public.term_results;
begin
  if not (app.is_admin() or app.is_exam_cell()) then
    raise exception 'Only the exam cell or administration can publish results';
  end if;
  select * into stu from public.students s where s.id = p_student;
  if not found then raise exception 'Unknown student'; end if;

  with per_assessment as (
    select e.course_id, c.code, c.title, c.credits, a.weightage,
      case when m.marks is null then 0 else m.marks / a.max_marks end as frac
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    join public.assessments a on a.section_id = e.section_id
    left join public.marks m on m.assessment_id = a.id and m.student_id = e.student_id
    where e.student_id = p_student and e.term_id = p_term and c.category <> 'class_group'
  ), per_course as (
    select code, title, credits,
      round(100 * sum(frac * weightage) / sum(weightage), 2) as percent
    from per_assessment group by code, title, credits
  ), graded as (
    select pc.*, g.letter, g.grade_point
    from per_course pc
    left join lateral (
      select gs.letter, gs.grade_point from public.grade_scales gs
      where gs.tier = stu.tier and gs.min_percent <= pc.percent
      order by gs.min_percent desc limit 1
    ) g on true
  )
  select jsonb_agg(to_jsonb(graded) order by code), round(avg(percent), 2),
    case when sum(credits) > 0 then round(sum(credits * grade_point) / sum(credits), 2) end,
    sum(credits), sum(credits) filter (where grade_point > 0)
  into rows, pct, sg, reg, earned from graded;

  if rows is null then raise exception 'No assessed courses for this student in this term'; end if;

  insert into public.term_results as tr (student_id, term_id, tier, percentage, division, sgpa,
    credits_registered, credits_earned, courses, verification_hash, is_published, published_at, published_by)
  values (p_student, p_term, stu.tier, pct,
    case when stu.tier = 'higher_secondary' then app.hs_division(pct) end,
    case when stu.tier <> 'higher_secondary' then sg end,
    reg, coalesce(earned, 0), rows,
    encode(sha256(convert_to(p_student::text || p_term::text || rows::text || gen_random_uuid()::text, 'UTF8')), 'hex'),
    true, now(), auth.uid())
  on conflict (student_id, term_id) do update set
    percentage = excluded.percentage, division = excluded.division, sgpa = excluded.sgpa,
    credits_registered = excluded.credits_registered, credits_earned = excluded.credits_earned,
    courses = excluded.courses, verification_hash = excluded.verification_hash,
    is_published = true, published_at = now(), published_by = auth.uid()
  returning tr.* into res;

  -- CGPA weights each published term's SGPA by the credits registered in it.
  if stu.tier <> 'higher_secondary' then
    select round(sum(t.sgpa * t.credits_registered) / nullif(sum(t.credits_registered), 0), 2)
      into cg from public.term_results t
      where t.student_id = p_student and t.is_published and t.sgpa is not null;
    update public.term_results t set cgpa = cg where t.id = res.id returning t.* into res;
  end if;
  return res;
end $$;
revoke execute on function public.publish_term_result(uuid, uuid) from public, anon;
grant execute on function public.publish_term_result(uuid, uuid) to authenticated;

-- Public verification reveals only what is printed on the mark sheet header.
create function public.verify_mark_sheet(p_hash text)
returns table (student_name text, enrollment_no text, term text, published_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.full_name, s.enrollment_no, t.label, r.published_at
  from public.term_results r
  join public.students s on s.id = r.student_id
  join public.terms t on t.id = r.term_id
  where r.verification_hash = p_hash and r.is_published
$$;
revoke execute on function public.verify_mark_sheet(text) from public;
grant execute on function public.verify_mark_sheet(text) to anon, authenticated;

alter table public.assessments enable row level security;
create policy assess_read on public.assessments for select to authenticated using (
  app.is_admin() or app.is_exam_cell() or app.teaches_section(section_id)
  or (is_published and exists (select 1 from public.enrollments e
    where e.section_id = assessments.section_id and app.can_view_student(e.student_id))));
create policy assess_write on public.assessments for all to authenticated
  using (app.is_admin() or app.is_exam_cell() or app.teaches_section(section_id))
  with check (app.is_admin() or app.is_exam_cell() or app.teaches_section(section_id));

create function app.can_grade(a uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_admin() or app.is_exam_cell() or exists (
    select 1 from public.assessments x where x.id = a and app.teaches_section(x.section_id))
$$;
create function app.assessment_published(a uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select x.is_published from public.assessments x where x.id = a), false)
$$;
grant execute on function app.can_grade(uuid), app.assessment_published(uuid) to authenticated, service_role;

alter table public.marks enable row level security;
create policy marks_read on public.marks for select to authenticated using (
  app.can_grade(assessment_id)
  or (app.assessment_published(assessment_id) and app.can_view_student(student_id)));
create policy marks_write on public.marks for all to authenticated
  using (app.can_grade(assessment_id)) with check (app.can_grade(assessment_id));

alter table public.grade_scales enable row level security;
create policy gs_read on public.grade_scales for select to authenticated using (true);
create policy gs_write on public.grade_scales for all to authenticated
  using (app.is_admin() or app.is_exam_cell()) with check (app.is_admin() or app.is_exam_cell());

alter table public.term_results enable row level security;
create policy tr_read on public.term_results for select to authenticated using (
  app.is_admin() or app.is_exam_cell() or (is_published and app.can_view_student(student_id)));
