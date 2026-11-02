-- Module 4: fee structures, an append-only ledger, and serialized receipts.
create type public.ledger_entry_type as enum ('charge', 'concession', 'scholarship', 'fine', 'payment', 'reversal');
create type public.payment_mode as enum ('cash', 'upi', 'bank_transfer');

create table public.fee_heads (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null
);
insert into public.fee_heads (code, name) values
  ('ADMISSION','Admission'), ('TUITION','Tuition'), ('LAB','Science Lab/Equipment'),
  ('LIBRARY','Library'), ('EXAM','Exam'), ('DEVELOPMENT','Development'), ('HOSTEL','Hostel'),
  ('LIBRARY_FINE','Library Overdue Fine');

create table public.fee_structures (
  id uuid primary key default gen_random_uuid(),
  tier public.tier not null,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  program_id uuid references public.programs (id) on delete restrict,
  period_no smallint not null default 1 check (period_no between 1 and 12),
  label text not null,
  due_on date,
  unique nulls not distinct (tier, academic_year_id, program_id, period_no)
);
create table public.fee_structure_items (
  structure_id uuid not null references public.fee_structures (id) on delete cascade,
  head_id uuid not null references public.fee_heads (id) on delete restrict,
  amount numeric(10,2) not null check (amount >= 0),
  primary key (structure_id, head_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete restrict,
  amount numeric(10,2) not null check (amount > 0),
  mode public.payment_mode not null,
  reference text,
  paid_on date not null default current_date,
  receipt_no text not null unique,
  verification_code text not null unique,
  received_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  check (mode = 'cash' or reference is not null)
);
create index payments_student_idx on public.payments (student_id);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete restrict,
  entry_type public.ledger_entry_type not null,
  head_id uuid references public.fee_heads (id) on delete restrict,
  structure_id uuid references public.fee_structures (id) on delete restrict,
  payment_id uuid references public.payments (id) on delete restrict,
  amount numeric(10,2) not null check (amount > 0),
  description text not null,
  due_on date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ledger_student_idx on public.ledger_entries (student_id, created_at);
-- Assigning a fee structure twice cannot double-charge a student.
create unique index ledger_one_structure_charge on public.ledger_entries (student_id, structure_id, head_id)
  where entry_type = 'charge' and structure_id is not null;

create function app.ledger_immutable() returns trigger language plpgsql as $$
begin raise exception 'Ledger entries cannot be changed. Post a reversal instead.'; end $$;
create trigger ledger_no_change before update or delete on public.ledger_entries
  for each row execute function app.ledger_immutable();

-- A voided payment has its entry reversed, so payment and reversal net to zero.
create view public.student_fee_balance with (security_invoker = true) as
select s.id as student_id,
  coalesce(sum(l.amount) filter (where l.entry_type in ('charge', 'fine')), 0) as total_due,
  coalesce(sum(l.amount) filter (where l.entry_type in ('concession', 'scholarship')), 0) as total_concession,
  coalesce(sum(l.amount) filter (where l.entry_type = 'payment'), 0)
    - coalesce(sum(l.amount) filter (where l.entry_type = 'reversal'), 0) as total_paid,
  coalesce(sum(case
    when l.entry_type in ('charge', 'fine', 'reversal') then l.amount
    when l.entry_type in ('concession', 'scholarship', 'payment') then -l.amount end), 0) as outstanding
from public.students s
left join public.ledger_entries l on l.student_id = s.id
group by s.id;

create table public.receipt_counters (
  financial_year text primary key,
  last_no integer not null default 0
);

create function app.can_collect_fees(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_admin() or app.is_office_for(app.student_tier(sid))
$$;
grant execute on function app.can_collect_fees(uuid) to authenticated, service_role;

create function public.record_payment(
  p_student uuid, p_amount numeric, p_mode public.payment_mode,
  p_reference text default null, p_paid_on date default current_date
) returns public.payments language plpgsql security definer set search_path = '' as $$
declare
  fy text;
  n integer;
  pay public.payments;
begin
  if not app.can_collect_fees(p_student) then
    raise exception 'Not allowed to record payments for this student';
  end if;
  -- Indian financial year: April to March.
  fy := case when extract(month from p_paid_on) >= 4
    then to_char(p_paid_on, 'YYYY') || '-' || to_char(p_paid_on + interval '1 year', 'YY')
    else to_char(p_paid_on - interval '1 year', 'YYYY') || '-' || to_char(p_paid_on, 'YY') end;
  insert into public.receipt_counters as c (financial_year, last_no) values (fy, 1)
    on conflict (financial_year) do update set last_no = c.last_no + 1
    returning c.last_no into n;
  insert into public.payments (student_id, amount, mode, reference, paid_on, receipt_no, verification_code, received_by)
  values (p_student, p_amount, p_mode, nullif(trim(p_reference), ''), p_paid_on,
    'DCC/' || fy || '/' || lpad(n::text, 6, '0'),
    upper(left(encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex'), 16)),
    auth.uid())
  returning * into pay;
  insert into public.ledger_entries (student_id, entry_type, payment_id, amount, description, created_by)
  values (p_student, 'payment', pay.id, p_amount, 'Payment ' || pay.receipt_no, auth.uid());
  return pay;
end $$;

create function public.void_payment(p_payment uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare pay public.payments;
begin
  if not app.is_admin() then raise exception 'Only administrators can void a payment'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  update public.payments set voided_at = now(), void_reason = p_reason
    where id = p_payment and voided_at is null returning * into pay;
  if not found then raise exception 'Payment not found or already voided'; end if;
  insert into public.ledger_entries (student_id, entry_type, payment_id, amount, description, created_by)
  values (pay.student_id, 'reversal', pay.id, pay.amount, 'Voided ' || pay.receipt_no || ': ' || p_reason, auth.uid());
end $$;

create function public.assign_fee_structure(p_structure uuid, p_students uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  fs public.fee_structures;
  inserted integer;
begin
  if not app.is_admin() then raise exception 'Only administrators can assign fee structures'; end if;
  select * into fs from public.fee_structures where id = p_structure;
  if not found then raise exception 'Unknown fee structure'; end if;
  if exists (select 1 from public.students s where s.id = any (p_students) and s.tier <> fs.tier) then
    raise exception 'A selected student is not in this fee structure''s tier';
  end if;
  insert into public.ledger_entries (student_id, entry_type, head_id, structure_id, amount, description, due_on, created_by)
  select s.id, 'charge', i.head_id, fs.id, i.amount, fs.label || ': ' || h.name, fs.due_on, auth.uid()
  from public.students s
  cross join public.fee_structure_items i
  join public.fee_heads h on h.id = i.head_id
  where s.id = any (p_students) and i.structure_id = fs.id and i.amount > 0
  on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end $$;

create function public.verify_receipt(p_code text)
returns table (receipt_no text, student_name text, amount numeric, paid_on date, is_void boolean)
language sql stable security definer set search_path = '' as $$
  select p.receipt_no, s.full_name, p.amount, p.paid_on, p.voided_at is not null
  from public.payments p join public.students s on s.id = p.student_id
  where p.verification_code = upper(p_code)
$$;

revoke execute on function public.record_payment(uuid, numeric, public.payment_mode, text, date) from public, anon;
revoke execute on function public.void_payment(uuid, text) from public, anon;
revoke execute on function public.assign_fee_structure(uuid, uuid[]) from public, anon;
revoke execute on function public.verify_receipt(text) from public;
grant execute on function public.record_payment(uuid, numeric, public.payment_mode, text, date) to authenticated;
grant execute on function public.void_payment(uuid, text) to authenticated;
grant execute on function public.assign_fee_structure(uuid, uuid[]) to authenticated;
grant execute on function public.verify_receipt(text) to anon, authenticated;

alter table public.fee_heads enable row level security;
create policy fh_read on public.fee_heads for select to authenticated using (true);
create policy fh_admin on public.fee_heads for all to authenticated using (app.is_admin()) with check (app.is_admin());
alter table public.fee_structures enable row level security;
create policy fs_read on public.fee_structures for select to authenticated using (true);
create policy fs_admin on public.fee_structures for all to authenticated using (app.is_admin()) with check (app.is_admin());
alter table public.fee_structure_items enable row level security;
create policy fsi_read on public.fee_structure_items for select to authenticated using (true);
create policy fsi_admin on public.fee_structure_items for all to authenticated using (app.is_admin()) with check (app.is_admin());

alter table public.payments enable row level security;
create policy pay_read on public.payments for select to authenticated
  using (app.can_collect_fees(student_id) or app.can_view_student(student_id));

alter table public.ledger_entries enable row level security;
create policy ledger_read on public.ledger_entries for select to authenticated
  using (app.can_collect_fees(student_id) or app.can_view_student(student_id));
-- Concessions and scholarships are posted directly by administrators.
create policy ledger_admin_insert on public.ledger_entries for insert to authenticated
  with check (app.is_admin() and entry_type in ('concession', 'scholarship', 'fine', 'charge'));

alter table public.receipt_counters enable row level security;
