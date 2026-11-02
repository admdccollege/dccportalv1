-- Module 5: targeted notices, attachments and Web Push subscriptions.
create type public.notice_audience as enum ('campus', 'higher_secondary', 'undergraduate', 'postgraduate', 'faculty', 'parents');
create type public.notice_priority as enum ('urgent', 'academic', 'exam', 'holiday', 'institutional');

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  body_html text not null,
  audience public.notice_audience not null default 'campus',
  priority public.notice_priority not null default 'institutional',
  is_published boolean not null default true,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  push_sent_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index notices_feed_idx on public.notices (published_at desc);

create table public.notice_attachments (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.notices (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  content_type text
);
create index notice_attachments_notice_idx on public.notice_attachments (notice_id);

create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create function app.can_see_audience(a public.notice_audience) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when app.is_admin() or app.is_exam_cell() then true
    when a = 'campus' then true
    when a = 'faculty' then app.is_staff()
    when a = 'parents' then app.role() = 'parent'
    when app.role() = 'student' then app.student_tier(app.my_student_id())::text = a::text
    when app.role() = 'parent' then exists (
      select 1 from public.student_guardians sg
      join public.guardians g on g.id = sg.guardian_id
      join public.students s on s.id = sg.student_id
      where g.user_id = auth.uid() and s.tier::text = a::text)
    when app.role() = 'faculty' then exists (
      select 1 from public.faculty_assignments fa
      join public.sections x on x.id = fa.section_id
      where fa.faculty_id = auth.uid() and x.tier::text = a::text)
    else exists (select 1 from public.profiles p
      where p.id = auth.uid() and a::text = any (p.tiers::text[]))
  end
$$;
grant execute on function app.can_see_audience(public.notice_audience) to authenticated, service_role;

alter table public.notices enable row level security;
create policy notices_read on public.notices for select to authenticated using (
  app.is_admin() or (is_published and published_at <= now()
    and (expires_at is null or expires_at > now()) and app.can_see_audience(audience)));
create policy notices_write on public.notices for all to authenticated
  using (app.is_admin() or app.is_exam_cell()) with check (app.is_admin() or app.is_exam_cell());

alter table public.notice_attachments enable row level security;
create policy na_read on public.notice_attachments for select to authenticated using (
  exists (select 1 from public.notices n where n.id = notice_id));
create policy na_write on public.notice_attachments for all to authenticated
  using (app.is_admin() or app.is_exam_cell()) with check (app.is_admin() or app.is_exam_cell());

alter table public.push_subscriptions enable row level security;
create policy ps_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
