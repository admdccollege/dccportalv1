-- Students and parents need teacher names on the timetable, but not staff contact details.
create function public.faculty_names(p_ids uuid[])
returns table (id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name from public.profiles p
  where auth.uid() is not null and p.id = any (p_ids)
    and p.role in ('faculty', 'lab_technician')
$$;
revoke execute on function public.faculty_names(uuid[]) from public, anon;
grant execute on function public.faculty_names(uuid[]) to authenticated;
