-- Module 6: timetable, leave, library and parent-visible remarks.
create type public.leave_type as enum ('casual', 'duty');
create type public.leave_status as enum ('pending', 'hod_approved', 'approved', 'rejected');
create type public.remark_kind as enum ('remark', 'incident', 'appreciation');

create table public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  section_id uuid not null references public.sections (id) on delete cascade,
  faculty_id uuid not null references public.profiles (id) on delete restrict,
  weekday smallint not null check (weekday between 1 and 7),
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 1 and 1440),
  room text,
  check (end_minute > start_minute),
  -- PostgreSQL itself rejects a faculty member double-booked across any tier.
  constraint timetable_no_faculty_clash exclude using gist (
    academic_year_id with =, faculty_id with =, weekday with =,
    int4range(start_minute, end_minute) with &&),
  constraint timetable_no_room_clash exclude using gist (
    academic_year_id with =, room with =, weekday with =,
    int4range(start_minute, end_minute) with &&) where (room is not null)
);
create index timetable_section_idx on public.timetable_slots (section_id);

create table public.faculty_leaves (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.profiles (id) on delete cascade,
  leave_type public.leave_type not null,
  from_date date not null,
  to_date date not null,
  reason text not null,
  substitute_id uuid references public.profiles (id) on delete set null,
  status public.leave_status not null default 'pending',
  hod_decided_by uuid references public.profiles (id) on delete set null,
  principal_decided_by uuid references public.profiles (id) on delete set null,
  decision_note text,
  created_at timestamptz not null default now(),
  check (to_date >= from_date),
  check (substitute_id is distinct from faculty_id)
);
create index faculty_leaves_faculty_idx on public.faculty_leaves (faculty_id);
create index faculty_leaves_status_idx on public.faculty_leaves (status);

create function app.is_hod_of(fac uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles me join public.profiles f on f.id = fac
    where me.id = auth.uid() and me.is_active and me.is_hod
      and me.department_id = f.department_id and me.id <> f.id)
$$;
grant execute on function app.is_hod_of(uuid) to authenticated, service_role;

-- Pending -> HOD approved -> approved, with rejection possible at either stage.
create function public.decide_leave(p_leave uuid, p_approve boolean, p_note text default null)
returns public.faculty_leaves language plpgsql security definer set search_path = '' as $$
declare l public.faculty_leaves;
begin
  select * into l from public.faculty_leaves where id = p_leave for update;
  if not found then raise exception 'Leave request not found'; end if;
  if l.status = 'pending' and app.is_hod_of(l.faculty_id) then
    update public.faculty_leaves set hod_decided_by = auth.uid(), decision_note = p_note,
      status = case when p_approve then 'hod_approved'::public.leave_status else 'rejected'::public.leave_status end
      where id = p_leave returning * into l;
  elsif l.status in ('pending', 'hod_approved') and app.is_admin() then
    update public.faculty_leaves set principal_decided_by = auth.uid(), decision_note = p_note,
      status = case when p_approve then 'approved'::public.leave_status else 'rejected'::public.leave_status end
      where id = p_leave returning * into l;
  else
    raise exception 'You cannot decide this leave request at its current stage';
  end if;
  return l;
end $$;
revoke execute on function public.decide_leave(uuid, boolean, text) from public, anon;
grant execute on function public.decide_leave(uuid, boolean, text) to authenticated;

create view public.faculty_workload with (security_invoker = true) as
select t.faculty_id, t.academic_year_id, count(*)::int as weekly_slots,
  round(sum(t.end_minute - t.start_minute) / 60.0, 1) as weekly_hours
from public.timetable_slots t group by t.faculty_id, t.academic_year_id;

create table public.library_settings (
  tier public.tier primary key,
  max_books smallint not null default 3 check (max_books >= 0),
  loan_days smallint not null default 14 check (loan_days > 0),
  fine_per_day numeric(6,2) not null default 2 check (fine_per_day >= 0)
);
insert into public.library_settings (tier) values
  ('higher_secondary'), ('undergraduate'), ('postgraduate');

create table public.library_books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  isbn text,
  created_at timestamptz not null default now()
);
create table public.library_copies (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.library_books (id) on delete cascade,
  accession_no text not null unique,
  barcode text unique,
  is_withdrawn boolean not null default false
);
create index library_copies_book_idx on public.library_copies (book_id);
create table public.library_loans (
  id uuid primary key default gen_random_uuid(),
  copy_id uuid not null references public.library_copies (id) on delete restrict,
  student_id uuid not null references public.students (id) on delete restrict,
  issued_on date not null default current_date,
  due_on date not null,
  returned_on date,
  fine_amount numeric(8,2) not null default 0,
  ledger_entry_id uuid references public.ledger_entries (id) on delete restrict,
  issued_by uuid references public.profiles (id) on delete set null
);
create unique index library_one_open_loan on public.library_loans (copy_id) where returned_on is null;
create index library_loans_student_idx on public.library_loans (student_id);

create function app.is_library_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_admin() or coalesce(app.role() = 'office_staff', false)
$$;
grant execute on function app.is_library_staff() to authenticated, service_role;

create function public.issue_book(p_code text, p_student uuid)
returns public.library_loans language plpgsql security definer set search_path = '' as $$
declare
  cp public.library_copies;
  stu public.students;
  cfg public.library_settings;
  open_count int;
  loan public.library_loans;
begin
  if not app.is_library_staff() then raise exception 'Not allowed to issue books'; end if;
  select * into cp from public.library_copies c
    where (c.barcode = p_code or c.accession_no = p_code) and not c.is_withdrawn;
  if not found then raise exception 'No available copy matches %', p_code; end if;
  select * into stu from public.students s where s.id = p_student and s.status = 'active' for update;
  if not found then raise exception 'Student is not active'; end if;
  select * into cfg from public.library_settings l where l.tier = stu.tier;
  select count(*) into open_count from public.library_loans l
    where l.student_id = p_student and l.returned_on is null;
  if open_count >= cfg.max_books then
    raise exception 'Lending limit of % books reached', cfg.max_books;
  end if;
  begin
    insert into public.library_loans (copy_id, student_id, due_on, issued_by)
    values (cp.id, p_student, current_date + cfg.loan_days, auth.uid()) returning * into loan;
  exception when unique_violation then
    raise exception 'This copy is already on loan';
  end;
  return loan;
end $$;

create function public.return_book(p_code text)
returns public.library_loans language plpgsql security definer set search_path = '' as $$
declare
  loan public.library_loans;
  rate numeric;
  fine numeric := 0;
  entry uuid;
begin
  if not app.is_library_staff() then raise exception 'Not allowed to return books'; end if;
  select l.* into loan from public.library_loans l
    join public.library_copies c on c.id = l.copy_id
    where (c.barcode = p_code or c.accession_no = p_code) and l.returned_on is null for update of l;
  if not found then raise exception 'No open loan for %', p_code; end if;
  select cfg.fine_per_day into rate from public.library_settings cfg
    join public.students s on s.tier = cfg.tier where s.id = loan.student_id;
  fine := greatest(current_date - loan.due_on, 0) * rate;
  if fine > 0 then
    insert into public.ledger_entries (student_id, entry_type, head_id, amount, description, created_by)
    select loan.student_id, 'fine', h.id, fine, 'Library overdue fine', auth.uid()
    from public.fee_heads h where h.code = 'LIBRARY_FINE' returning id into entry;
  end if;
  update public.library_loans set returned_on = current_date, fine_amount = fine, ledger_entry_id = entry
    where id = loan.id returning * into loan;
  return loan;
end $$;
revoke execute on function public.issue_book(text, uuid) from public, anon;
revoke execute on function public.return_book(text) from public, anon;
grant execute on function public.issue_book(text, uuid) to authenticated;
grant execute on function public.return_book(text) to authenticated;

create table public.student_remarks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  kind public.remark_kind not null default 'remark',
  body text not null check (length(trim(body)) > 0),
  visible_to_parent boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index student_remarks_student_idx on public.student_remarks (student_id, created_at desc);

alter table public.timetable_slots enable row level security;
create policy tt_read on public.timetable_slots for select to authenticated using (true);
create policy tt_admin on public.timetable_slots for all to authenticated using (app.is_admin()) with check (app.is_admin());

alter table public.faculty_leaves enable row level security;
create policy leave_read on public.faculty_leaves for select to authenticated using (
  faculty_id = auth.uid() or substitute_id = auth.uid() or app.is_admin() or app.is_hod_of(faculty_id));
create policy leave_request on public.faculty_leaves for insert to authenticated
  with check (faculty_id = auth.uid() and status = 'pending' and app.is_staff());

alter table public.library_settings enable row level security;
create policy ls_read on public.library_settings for select to authenticated using (true);
create policy ls_admin on public.library_settings for all to authenticated using (app.is_admin()) with check (app.is_admin());
alter table public.library_books enable row level security;
create policy lb_read on public.library_books for select to authenticated using (true);
create policy lb_write on public.library_books for all to authenticated using (app.is_library_staff()) with check (app.is_library_staff());
alter table public.library_copies enable row level security;
create policy lc_read on public.library_copies for select to authenticated using (true);
create policy lc_write on public.library_copies for all to authenticated using (app.is_library_staff()) with check (app.is_library_staff());
alter table public.library_loans enable row level security;
create policy ll_read on public.library_loans for select to authenticated
  using (app.is_library_staff() or app.can_view_student(student_id));

alter table public.student_remarks enable row level security;
create policy remarks_read on public.student_remarks for select to authenticated using (
  app.is_admin() or created_by = auth.uid() or app.teaches_student(student_id)
  or (visible_to_parent and app.is_guardian_of(student_id)));
create policy remarks_insert on public.student_remarks for insert to authenticated with check (
  created_by = auth.uid() and (app.is_admin() or app.teaches_student(student_id)));
create policy remarks_admin_delete on public.student_remarks for delete to authenticated using (app.is_admin());
