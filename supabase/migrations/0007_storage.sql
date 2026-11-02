-- Private buckets. Paths: student-documents/<student_id>/<file>, notice-attachments/<notice_id>/<file>.
insert into storage.buckets (id, name, public) values
  ('student-documents', 'student-documents', false),
  ('notice-attachments', 'notice-attachments', false)
on conflict (id) do nothing;

create function app.path_uuid(path text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(path, '/', 1)::uuid;
exception when others then
  return null;
end $$;
grant execute on function app.path_uuid(text) to authenticated, service_role;

create policy student_docs_read on storage.objects for select to authenticated using (
  bucket_id = 'student-documents' and app.can_read_student_record(app.path_uuid(name)));
create policy student_docs_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'student-documents' and (app.is_admin()
    or app.is_office_for(app.student_tier(app.path_uuid(name)))));
create policy student_docs_delete on storage.objects for delete to authenticated using (
  bucket_id = 'student-documents' and (app.is_admin()
    or app.is_office_for(app.student_tier(app.path_uuid(name)))));

create policy notice_files_read on storage.objects for select to authenticated using (
  bucket_id = 'notice-attachments' and exists (
    select 1 from public.notices n where n.id = app.path_uuid(name)));
create policy notice_files_write on storage.objects for insert to authenticated with check (
  bucket_id = 'notice-attachments' and (app.is_admin() or app.is_exam_cell()));
create policy notice_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'notice-attachments' and (app.is_admin() or app.is_exam_cell()));
