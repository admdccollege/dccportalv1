-- Module 2: attendance, 24-hour edit lock, statutory compliance alerts.
create type public.attendance_status as enum ('P', 'A', 'L', 'E');
create type public.attendance_kind as enum ('period', 'morning', 'afternoon', 'lecture', 'lab');

create table public.attendance_policies (
  tier public.tier primary key,
  min_percent numeric(5,2) not null default 75 check (min_percent between 0 and 100),
  min_sessions_before_alert smallint not null default 5 check (min_sessions_before_alert >= 1)
);
insert into public.attendance_policies (tier) values
  ('higher_secondary'), ('undergraduate'), ('postgraduate');

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections (id) on delete restrict,
  session_date date not null,
  slot text not null check (length(trim(slot)) > 0),
  kind public.attendance_kind not null,
  client_id uuid unique,
  marked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (section_id, session_date, slot)
);
create index attendance_sessions_date_idx on public.attendance_sessions (session_date);

create table public.attendance_records (
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  status public.attendance_status not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (session_id, student_id)
);
create index attendance_records_student_idx on public.attendance_records (student_id);

create function app.attendance_session_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if app.is_admin() or auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if new.session_date > (now() at time zone 'Asia/Kolkata')::date then
      raise exception 'Attendance cannot be marked for a future date';
    end if;
    -- Offline devices may sync late, but only within a week.
    if new.session_date < (now() at time zone 'Asia/Kolkata')::date - 7 then
      raise exception 'This date is too old to mark. Contact the administration.';
    end if;
    return new;
  end if;
  if old.created_at < now() - interval '24 hours' then
    raise exception 'Attendance is locked 24 hours after marking';
  end if;
  return coalesce(new, old);
end $$;
create trigger attendance_sessions_guard before insert or update or delete
  on public.attendance_sessions for each row execute function app.attendance_session_guard();

create function app.attendance_record_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  sess public.attendance_sessions;
  sid uuid := coalesce(new.session_id, old.session_id);
begin
  select * into sess from public.attendance_sessions s where s.id = sid;
  if tg_op <> 'DELETE' then
    if not exists (select 1 from public.enrollments e
        where e.section_id = sess.section_id and e.student_id = new.student_id) then
      raise exception 'Student is not enrolled in this section';
    end if;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  if auth.uid() is not null and not app.is_admin()
     and sess.created_at < now() - interval '24 hours' then
    raise exception 'Attendance is locked 24 hours after marking';
  end if;
  return coalesce(new, old);
end $$;
create trigger attendance_records_guard before insert or update or delete
  on public.attendance_records for each row execute function app.attendance_record_guard();

-- P and L count as attended. E is removed from the total. A counts against.
create view public.attendance_summary with (security_invoker = true) as
select r.student_id, s.section_id,
  count(*) filter (where r.status in ('P', 'L'))::int as attended,
  count(*) filter (where r.status <> 'E')::int as total,
  case when count(*) filter (where r.status <> 'E') = 0 then null else
    round(100.0 * count(*) filter (where r.status in ('P', 'L'))
      / count(*) filter (where r.status <> 'E'), 2) end as percent
from public.attendance_records r
join public.attendance_sessions s on s.id = r.session_id
group by r.student_id, s.section_id;

create table public.attendance_alerts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  section_id uuid not null references public.sections (id) on delete cascade,
  percent numeric(5,2) not null,
  raised_at timestamptz not null default now(),
  resolved_at timestamptz,
  push_sent_at timestamptz
);
create unique index attendance_alerts_open on public.attendance_alerts (student_id, section_id)
  where resolved_at is null;

create function app.refresh_attendance_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  stu uuid := coalesce(new.student_id, old.student_id);
  sec uuid;
  pct numeric;
  tot int;
  pol public.attendance_policies;
begin
  select s.section_id into sec from public.attendance_sessions s
    where s.id = coalesce(new.session_id, old.session_id);
  if sec is null then return null; end if;
  select a.percent, a.total into pct, tot from public.attendance_summary a
    where a.student_id = stu and a.section_id = sec;
  select p.* into pol from public.attendance_policies p
    join public.sections x on x.tier = p.tier where x.id = sec;
  if pct is not null and tot >= pol.min_sessions_before_alert and pct < pol.min_percent then
    insert into public.attendance_alerts (student_id, section_id, percent)
    values (stu, sec, pct)
    on conflict (student_id, section_id) where resolved_at is null
    do update set percent = excluded.percent;
  else
    update public.attendance_alerts set resolved_at = now()
      where student_id = stu and section_id = sec and resolved_at is null;
  end if;
  return null;
end $$;
create trigger attendance_records_alert after insert or update or delete
  on public.attendance_records for each row execute function app.refresh_attendance_alert();

-- Atomic and idempotent, so an offline device can safely retry a sync.
create function public.save_attendance(
  p_client_id uuid, p_section_id uuid, p_date date, p_slot text,
  p_kind public.attendance_kind, p_records jsonb
) returns uuid language plpgsql set search_path = public as $$
declare sess_id uuid;
begin
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception 'No attendance records supplied';
  end if;
  select id into sess_id from attendance_sessions where client_id = p_client_id;
  if sess_id is null then
    select id into sess_id from attendance_sessions
      where section_id = p_section_id and session_date = p_date and slot = p_slot;
  end if;
  if sess_id is null then
    insert into attendance_sessions (section_id, session_date, slot, kind, client_id, marked_by)
    values (p_section_id, p_date, p_slot, p_kind, p_client_id, auth.uid())
    returning id into sess_id;
  end if;
  insert into attendance_records (session_id, student_id, status, updated_by)
  select sess_id, (x->>'student_id')::uuid, (x->>'status')::attendance_status, auth.uid()
  from jsonb_array_elements(p_records) x
  on conflict (session_id, student_id) do update
    set status = excluded.status, updated_by = excluded.updated_by
    where attendance_records.status is distinct from excluded.status;
  return sess_id;
end $$;
revoke execute on function public.save_attendance(uuid, uuid, date, text, public.attendance_kind, jsonb) from public, anon;
grant execute on function public.save_attendance(uuid, uuid, date, text, public.attendance_kind, jsonb) to authenticated;

alter table public.attendance_policies enable row level security;
create policy ap_read on public.attendance_policies for select to authenticated using (true);
create policy ap_admin on public.attendance_policies for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

alter table public.attendance_sessions enable row level security;
create policy as_read on public.attendance_sessions for select to authenticated using (
  app.is_admin() or app.is_exam_cell() or app.teaches_section(section_id)
  or exists (select 1 from public.enrollments e where e.section_id = attendance_sessions.section_id
    and app.can_view_student(e.student_id)));
create policy as_insert on public.attendance_sessions for insert to authenticated
  with check (app.is_admin() or app.teaches_section(section_id));
create policy as_update on public.attendance_sessions for update to authenticated
  using (app.is_admin() or app.teaches_section(section_id))
  with check (app.is_admin() or app.teaches_section(section_id));
create policy as_delete on public.attendance_sessions for delete to authenticated using (app.is_admin());

create function app.teaches_session(sess uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.attendance_sessions s
    where s.id = sess and app.teaches_section(s.section_id))
$$;
grant execute on function app.teaches_session(uuid) to authenticated, service_role;

alter table public.attendance_records enable row level security;
create policy ar_read on public.attendance_records for select to authenticated using (
  app.is_admin() or app.is_exam_cell() or app.teaches_session(session_id)
  or app.can_view_student(student_id));
create policy ar_insert on public.attendance_records for insert to authenticated
  with check (app.is_admin() or app.teaches_session(session_id));
create policy ar_update on public.attendance_records for update to authenticated
  using (app.is_admin() or app.teaches_session(session_id))
  with check (app.is_admin() or app.teaches_session(session_id));
create policy ar_delete on public.attendance_records for delete to authenticated using (app.is_admin());

alter table public.attendance_alerts enable row level security;
create policy alerts_read on public.attendance_alerts for select to authenticated using (
  app.is_admin() or app.teaches_section(section_id) or app.can_view_student(student_id));
