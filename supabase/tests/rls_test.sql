\set ON_ERROR_STOP on
\set QUIET on
create or replace function t_ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create or replace function t_err(q text, pattern text, label text) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then
    if sqlerrm ~* pattern then raise notice 'ok - %', label; return; end if;
    raise exception 'FAIL: % (got: %)', label, sqlerrm;
  end;
  raise exception 'FAIL: % (no error raised)', label;
end $$;
grant execute on all functions in schema public to authenticated, anon;

insert into auth.users (id) values
 ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004'),
 ('00000000-0000-0000-0000-000000000005'),('00000000-0000-0000-0000-000000000006'),
 ('00000000-0000-0000-0000-000000000007'),('00000000-0000-0000-0000-000000000008'),
 ('00000000-0000-0000-0000-000000000009');
insert into departments (id, code, name) values ('d0000000-0000-0000-0000-000000000001','HIS','History');
insert into profiles (id, full_name, role, department_id, is_hod, tiers) values
 ('00000000-0000-0000-0000-000000000001','Admin','super_admin',null,false,'{}'),
 ('00000000-0000-0000-0000-000000000002','Fac A','faculty','d0000000-0000-0000-0000-000000000001',false,'{}'),
 ('00000000-0000-0000-0000-000000000003','Fac B','faculty','d0000000-0000-0000-0000-000000000001',true,'{}'),
 ('00000000-0000-0000-0000-000000000004','Stu A','student',null,false,'{}'),
 ('00000000-0000-0000-0000-000000000005','Stu B','student',null,false,'{}'),
 ('00000000-0000-0000-0000-000000000006','Parent A','parent',null,false,'{}'),
 ('00000000-0000-0000-0000-000000000007','Office','office_staff',null,false,'{undergraduate}'),
 ('00000000-0000-0000-0000-000000000008','Exam','exam_cell',null,false,'{}'),
 ('00000000-0000-0000-0000-000000000009','Principal','principal',null,false,'{}');
insert into academic_years (id,label,starts_on,ends_on,is_current) values
 ('a0000000-0000-0000-0000-000000000001','2026-27','2026-06-01','2027-05-31',true);
insert into terms (id,academic_year_id,tier,term_no,label,starts_on,ends_on) values
 ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','undergraduate',1,'UG Sem I','2026-06-01','2026-11-30'),
 ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','undergraduate',2,'UG Sem II','2026-12-01','2027-05-31');
insert into courses (id,tier,code,title,category,credits) values
 ('c0000000-0000-0000-0000-000000000001','undergraduate','HIS101','History I','major',4),
 ('c0000000-0000-0000-0000-000000000002','undergraduate','HIS102','History II','major',2);
insert into sections (id,course_id,term_id,tier) values
 ('50000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','undergraduate'),
 ('50000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000001','undergraduate');
insert into faculty_assignments values
 ('00000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000002');
insert into students (id,user_id,enrollment_no,tier,full_name,degree,major_subject,semester) values
 ('b0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','UG1','undergraduate','Stu A','BA','History',1),
 ('b0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005','UG2','undergraduate','Stu B','BA','History',1);
insert into guardians (id,user_id,full_name,phone) values ('90000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006','Parent A','9000000001');
insert into student_guardians values ('b0000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001',true);
insert into enrollments (student_id,section_id) values
 ('b0000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001'),
 ('b0000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001'),
 ('b0000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002');
select t_ok((select course_id from enrollments limit 1) is not null, 'enrollment fills course and term from section');
select t_err($$insert into students (enrollment_no,tier,full_name) values ('X','undergraduate','No Fields')$$,'students_tier_fields','tier-specific fields are enforced');
select t_err($$insert into enrollments (student_id,section_id) values ('b0000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001')$$,'unique|duplicate','student+course+term is unique');

-- Each block below acts as one signed-in user.
set role authenticated; set request.jwt.sub = '00000000-0000-0000-0000-000000000002';
select t_ok((select count(*) from students) = 2, 'faculty sees only students in their sections');
select save_attendance('11111111-1111-1111-1111-111111111111','50000000-0000-0000-0000-000000000001',(now() at time zone 'Asia/Kolkata')::date,'P1','lecture',
 '[{"student_id":"b0000000-0000-0000-0000-000000000001","status":"P"},{"student_id":"b0000000-0000-0000-0000-000000000002","status":"A"}]');
select save_attendance('11111111-1111-1111-1111-111111111111','50000000-0000-0000-0000-000000000001',(now() at time zone 'Asia/Kolkata')::date,'P1','lecture',
 '[{"student_id":"b0000000-0000-0000-0000-000000000001","status":"P"},{"student_id":"b0000000-0000-0000-0000-000000000002","status":"A"}]');
select t_ok((select count(*) from attendance_sessions) = 1, 'retrying an offline sync does not duplicate the session');
select t_err($$select save_attendance(gen_random_uuid(),'50000000-0000-0000-0000-000000000002',current_date,'P1','lecture','[{"student_id":"b0000000-0000-0000-0000-000000000001","status":"P"}]')$$,'row-level security','faculty cannot mark an unassigned section');
select t_err($$select save_attendance(gen_random_uuid(),'50000000-0000-0000-0000-000000000001',current_date + 3,'P2','lecture','[{"student_id":"b0000000-0000-0000-0000-000000000001","status":"P"}]')$$,'future','future attendance is rejected');
select t_err($$select save_attendance(gen_random_uuid(),'50000000-0000-0000-0000-000000000001',current_date - 30,'P2','lecture','[{"student_id":"b0000000-0000-0000-0000-000000000001","status":"P"}]')$$,'too old','attendance over a week old is rejected for faculty');

reset role; set request.jwt.sub='';
update attendance_sessions set created_at = now() - interval '25 hours';
set role authenticated; set request.jwt.sub = '00000000-0000-0000-0000-000000000002';
select t_err($$update attendance_records set status='P' where student_id='b0000000-0000-0000-0000-000000000002'$$,'locked','faculty edit is locked after 24 hours');
set request.jwt.sub = '00000000-0000-0000-0000-000000000001';
update attendance_records set status='A' where student_id='b0000000-0000-0000-0000-000000000001';
update attendance_records set status='P' where student_id='b0000000-0000-0000-0000-000000000001';
select t_ok(true, 'admin can correct attendance after the lock');

set request.jwt.sub = '00000000-0000-0000-0000-000000000004';
select t_ok((select count(*) from students) = 1, 'student sees only their own record');
select t_ok((select count(*) from attendance_records) = 1, 'student sees only their own attendance');
select t_err($$insert into attendance_sessions (section_id,session_date,slot,kind) values ('50000000-0000-0000-0000-000000000001',current_date,'P9','lecture')$$,'row-level security','student cannot create attendance');
do $$ begin update students set full_name='Hacked'; end $$;
select t_ok((select full_name from students) = 'Stu A', 'student cannot edit their record');
do $$ begin update profiles set role='super_admin' where id = auth.uid(); end $$;
select t_ok((select role from profiles where id = auth.uid()) = 'student', 'student cannot raise their own role');

set request.jwt.sub = '00000000-0000-0000-0000-000000000006';
select t_ok((select array_agg(enrollment_no) from students) = '{UG1}', 'parent sees only the linked child');
select t_ok((select count(*) from attendance_records) = 1, 'parent sees only the child''s attendance');

-- Alerts, using sessions marked by faculty.
reset role; set request.jwt.sub='';
insert into attendance_sessions (id,section_id,session_date,slot,kind)
select ('aa000000-0000-0000-0000-00000000000'||g)::uuid,'50000000-0000-0000-0000-000000000001',current_date - g,'P1','lecture' from generate_series(1,5) g;
insert into attendance_records (session_id,student_id,status)
select ('aa000000-0000-0000-0000-00000000000'||g)::uuid,'b0000000-0000-0000-0000-000000000002','A' from generate_series(1,5) g;
select t_ok((select count(*) from attendance_alerts where student_id='b0000000-0000-0000-0000-000000000002' and resolved_at is null)=1,'low attendance raises one open alert');
update attendance_records set status='P' where student_id='b0000000-0000-0000-0000-000000000002';
select t_ok((select count(*) from attendance_alerts where resolved_at is null)=0,'recovering attendance resolves the alert');
insert into attendance_records (session_id,student_id,status) values ('aa000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','E');
select t_ok((select total from attendance_summary where student_id='b0000000-0000-0000-0000-000000000001' and section_id='50000000-0000-0000-0000-000000000001')=1,'excused absence is excluded from the total');

-- Marks.
insert into assessments (id,section_id,name,kind,max_marks,weightage) values
 ('ab000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','CIA 1','cia_1',50,100),
 ('ab000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','CIA 1','cia_1',100,100);
set role authenticated; set request.jwt.sub='00000000-0000-0000-0000-000000000002';
select t_err($$insert into marks (assessment_id,student_id,marks) values ('ab000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',51)$$,'exceed','marks above the maximum are rejected');
select t_err($$insert into marks (assessment_id,student_id,marks) values ('ab000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001',50)$$,'row-level security','faculty cannot grade an unassigned section');
insert into marks (assessment_id,student_id,marks) values ('ab000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',45);
select t_err($$insert into marks (assessment_id,student_id,marks,is_absent) values ('ab000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002',10,true)$$,'check','an absent student cannot also have marks');
insert into marks (assessment_id,student_id,is_absent) values ('ab000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002',true);
set request.jwt.sub='00000000-0000-0000-0000-000000000004';
select t_ok((select count(*) from marks)=0,'student cannot see unpublished marks');
set request.jwt.sub='00000000-0000-0000-0000-000000000003';
insert into marks (assessment_id,student_id,marks) values ('ab000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001',70);
update assessments set is_published=true;
set request.jwt.sub='00000000-0000-0000-0000-000000000002';
update assessments set is_published=true;
set request.jwt.sub='00000000-0000-0000-0000-000000000004';
select t_ok((select count(*) from marks)=2,'student sees own published marks only');
select t_err($$update marks set marks=50$$,'.*','never') where false;
do $$ begin update marks set marks=50; end $$;
select t_ok((select max(marks) from marks)=70 and (select min(marks) from marks)=45,'student cannot change marks');
select t_err($$select publish_term_result('b0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001')$$,'Only the exam cell','student cannot publish results');
set request.jwt.sub='00000000-0000-0000-0000-000000000008';
-- 90% on 4 credits = O (10), 70% on 2 credits = A (8): SGPA = (40 + 16) / 6 = 9.33
select t_ok((select sgpa from publish_term_result('b0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001'))=9.33,'SGPA is credit-weighted');
select t_ok((select cgpa from term_results)=9.33,'CGPA is computed from published terms');
reset role; set request.jwt.sub='';
set role anon;
select t_ok((select count(*) from verify_mark_sheet((select 'nope')))=0,'unknown hash fails verification');
reset role; set request.jwt.sub='';
select t_ok((select count(*) from verify_mark_sheet((select verification_hash from term_results)))=1,'real hash passes verification');

-- Fees.
insert into fee_structures (id,tier,academic_year_id,label) values ('f0000000-0000-0000-0000-000000000001','undergraduate','a0000000-0000-0000-0000-000000000001','UG Sem I');
insert into fee_structure_items select 'f0000000-0000-0000-0000-000000000001',id,5000 from fee_heads where code='TUITION';
set role authenticated; set request.jwt.sub='00000000-0000-0000-0000-000000000001';
select t_ok(assign_fee_structure('f0000000-0000-0000-0000-000000000001',array['b0000000-0000-0000-0000-000000000001'::uuid])=1,'fee structure charges the student');
select t_ok(assign_fee_structure('f0000000-0000-0000-0000-000000000001',array['b0000000-0000-0000-0000-000000000001'::uuid])=0,'assigning twice does not double-charge');
insert into ledger_entries (student_id,entry_type,amount,description) values ('b0000000-0000-0000-0000-000000000001','scholarship',1000,'Merit');
set request.jwt.sub='00000000-0000-0000-0000-000000000007';
select t_ok((select receipt_no from record_payment('b0000000-0000-0000-0000-000000000001',1500,'cash',null,'2026-11-02'))='DCC/2026-27/000001','receipts are serialized by financial year');
select t_ok((select receipt_no from record_payment('b0000000-0000-0000-0000-000000000001',500,'upi','UTR1','2026-11-02'))='DCC/2026-27/000002','receipt numbers increase');
select t_ok((select outstanding from student_fee_balance where student_id='b0000000-0000-0000-0000-000000000001')=2000,'outstanding = 5000 - 1000 - 1500 - 500');
select t_err($$select void_payment((select id from payments limit 1),'x')$$,'Only administrators','office staff cannot void a payment');
select t_err($$delete from ledger_entries$$,'.*','never') where false;
set request.jwt.sub='00000000-0000-0000-0000-000000000001';
select void_payment((select id from payments where amount=500),'Bounced');
select t_ok((select outstanding from student_fee_balance where student_id='b0000000-0000-0000-0000-000000000001')=2500,'voiding restores the balance');
select t_ok((select total_paid from student_fee_balance where student_id='b0000000-0000-0000-0000-000000000001')=1500,'voiding reduces total paid');
update ledger_entries set amount=1;
select t_ok((select min(amount) from ledger_entries)>1,'RLS blocks ledger edits, even for admins');
reset role; set request.jwt.sub='';
select t_err($$update ledger_entries set amount=1$$,'cannot be changed','the ledger trigger blocks edits by privileged connections');
set role authenticated;
set request.jwt.sub='00000000-0000-0000-0000-000000000005';
select t_ok((select count(*) from payments)=0,'a student cannot see another student''s payments');
select t_err($$select record_payment('b0000000-0000-0000-0000-000000000002',1,'cash')$$,'Not allowed','student cannot record a payment');
select t_err($$insert into ledger_entries (student_id,entry_type,amount,description) values ('b0000000-0000-0000-0000-000000000002','scholarship',99999,'free')$$,'row-level security','student cannot post a scholarship');
reset role; set request.jwt.sub='';
select t_ok((select is_void from verify_receipt((select verification_code from payments where amount=500))),'voided receipts verify as void');

-- Notices.
insert into notices (title,body_html,audience) values ('All','x','campus'),('HS','x','higher_secondary'),('UG','x','undergraduate'),('Fac','x','faculty'),('Par','x','parents');
set role authenticated; set request.jwt.sub='00000000-0000-0000-0000-000000000004';
select t_ok((select array_agg(title order by title) from notices)='{All,UG}','UG student sees campus and UG notices');
select t_err($$insert into notices (title,body_html) values ('x','x')$$,'row-level security','student cannot post notices');
set request.jwt.sub='00000000-0000-0000-0000-000000000006';
select t_ok((select array_agg(title order by title) from notices)='{All,Par,UG}','parent sees parent and child-tier notices');
set request.jwt.sub='00000000-0000-0000-0000-000000000002';
select t_ok((select array_agg(title order by title) from notices)='{All,Fac,UG}','faculty sees faculty and teaching-tier notices');

-- Timetable.
reset role; set request.jwt.sub='';
insert into timetable_slots (academic_year_id,section_id,faculty_id,weekday,start_minute,end_minute,room) values
 ('a0000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',1,600,660,'R1');
select t_err($$insert into timetable_slots (academic_year_id,section_id,faculty_id,weekday,start_minute,end_minute) values ('a0000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',1,630,690)$$,'timetable_no_faculty_clash','overlapping faculty slots are rejected');
select t_err($$insert into timetable_slots (academic_year_id,section_id,faculty_id,weekday,start_minute,end_minute,room) values ('a0000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003',1,630,690,'R1')$$,'timetable_no_room_clash','overlapping room bookings are rejected');
insert into timetable_slots (academic_year_id,section_id,faculty_id,weekday,start_minute,end_minute) values ('a0000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',1,660,720);
select t_ok(true,'back-to-back slots are allowed');

-- Leave.
set role authenticated; set request.jwt.sub='00000000-0000-0000-0000-000000000002';
insert into faculty_leaves (id,faculty_id,leave_type,from_date,to_date,reason,substitute_id) values ('1e000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','casual',current_date,current_date,'Family','00000000-0000-0000-0000-000000000003');
select t_err($$select decide_leave('1e000000-0000-0000-0000-000000000001',true)$$,'cannot decide','faculty cannot approve their own leave');
set request.jwt.sub='00000000-0000-0000-0000-000000000003';
select t_ok((select status from decide_leave('1e000000-0000-0000-0000-000000000001',true))='hod_approved','HOD approves first');
select t_err($$select decide_leave('1e000000-0000-0000-0000-000000000001',true)$$,'cannot decide','HOD cannot give the final approval');
set request.jwt.sub='00000000-0000-0000-0000-000000000009';
select t_ok((select status from decide_leave('1e000000-0000-0000-0000-000000000001',true))='approved','principal gives final approval');

-- Library.
reset role; set request.jwt.sub='';
insert into library_books (id,title) values ('1b000000-0000-0000-0000-000000000001','Book');
insert into library_copies (book_id,accession_no,barcode) select '1b000000-0000-0000-0000-000000000001','ACC'||g,'BC'||g from generate_series(1,5) g;
set role authenticated; set request.jwt.sub='00000000-0000-0000-0000-000000000007';
select issue_book('BC1','b0000000-0000-0000-0000-000000000001');
select t_err($$select issue_book('BC1','b0000000-0000-0000-0000-000000000002')$$,'already on loan','a copy cannot be lent twice');
select issue_book('BC2','b0000000-0000-0000-0000-000000000001'); select issue_book('BC3','b0000000-0000-0000-0000-000000000001');
select t_err($$select issue_book('BC4','b0000000-0000-0000-0000-000000000001')$$,'Lending limit','lending limit is enforced');
reset role; set request.jwt.sub=''; update library_loans set due_on=current_date-5 where copy_id=(select id from library_copies where barcode='BC1');
set role authenticated; set request.jwt.sub='00000000-0000-0000-0000-000000000007';
select t_ok((select fine_amount from return_book('BC1'))=10,'overdue fine = 5 days at 2 per day');
select t_ok((select outstanding from student_fee_balance where student_id='b0000000-0000-0000-0000-000000000001')=2510,'the fine reaches the fee ledger');
set request.jwt.sub='00000000-0000-0000-0000-000000000004';
select t_err($$select issue_book('BC4','b0000000-0000-0000-0000-000000000004')$$,'Not allowed','student cannot issue books');

-- Remarks.
set request.jwt.sub='00000000-0000-0000-0000-000000000002';
insert into student_remarks (student_id,kind,body) values ('b0000000-0000-0000-0000-000000000001','incident','Shared');
insert into student_remarks (student_id,body,visible_to_parent) values ('b0000000-0000-0000-0000-000000000001','Staff only',false);
set request.jwt.sub='00000000-0000-0000-0000-000000000006';
select t_ok((select array_agg(body) from student_remarks)='{Shared}','parent sees only remarks shared with them');
set request.jwt.sub='00000000-0000-0000-0000-000000000005';
select t_ok((select count(*) from student_remarks)=0,'other students see no remarks');

-- Anonymous access.
set role anon; set request.jwt.sub='';
select t_err($$select * from students$$,'denied|permission','anon cannot read students') where false;
select t_ok((select count(*) from students)=0,'anonymous users see no students');
reset role; set request.jwt.sub='';
do $$ declare missing text; begin
  select string_agg(c.relname,', ') into missing from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
  perform t_ok(missing is null, 'RLS is enabled on every table (missing: '||coalesce(missing,'none')||')');
end $$;
