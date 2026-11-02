import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Submit } from "@/components/action-form";
import { addRemark, updateStatus, uploadDocument } from "../actions";
import { TIER_LABEL, type Tier } from "@/lib/roles";

type Doc = { id: string; kind: string; file_name: string; storage_path: string };
type Remark = { id: string; kind: string; body: string; created_at: string; visible_to_parent: boolean };
type Guardian = { guardians: { full_name: string; relation: string; phone: string } };
type Attendance = { section_id: string; attended: number; total: number; percent: number | null };

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(["super_admin", "management", "principal", "exam_cell", "faculty", "office_staff"]);
  const { id } = await params;
  const supabase = await createClient();
  const { data: s } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  if (!s) notFound();
  const [docs, remarks, guardians, attendance] = await Promise.all([
    supabase.from("student_documents").select("id, kind, file_name, storage_path").eq("student_id", id),
    supabase.from("student_remarks").select("id, kind, body, created_at, visible_to_parent").eq("student_id", id).order("created_at", { ascending: false }),
    supabase.from("student_guardians").select("guardians(full_name, relation, phone)").eq("student_id", id),
    supabase.from("attendance_summary").select("section_id, attended, total, percent").eq("student_id", id),
  ]);
  const docRows: Doc[] = docs.data ?? [];
  const links = await Promise.all(docRows.map(async (d) => {
    const { data } = await supabase.storage.from("student-documents").createSignedUrl(d.storage_path, 300);
    return { ...d, url: data?.signedUrl };
  }));
  const canManage = ["super_admin", "management", "principal", "office_staff"].includes(profile.role);
  const canRemark = ["super_admin", "management", "principal", "faculty"].includes(profile.role);
  const facts: [string, unknown][] = [
    ["Enrollment", s.enrollment_no], ["Tier", TIER_LABEL[s.tier as Tier]], ["Class", s.class_level], ["Stream", s.stream],
    ["Council Reg", s.council_reg_no], ["Degree", s.degree], ["Major", s.major_subject], ["Minor", s.minor_subject],
    ["Semester", s.semester], ["University Roll", s.university_roll_no], ["University Reg", s.university_reg_no],
    ["Specialization", s.specialization], ["Previous degree", s.previous_degree && `${s.previous_degree}${s.previous_degree_verified ? " (verified)" : " (not verified)"}`],
    ["Combination", (s.combination_subjects ?? []).join(", ")], ["Residential", String(s.residential_category).replace("_", " ")],
    ["Date of birth", s.date_of_birth], ["Mobile", s.phone], ["Email", s.email], ["Address", s.address],
  ];
  return (
    <div className="space-y-4">
      <h1 className="page-title mb-0">{s.full_name} <span className="badge align-middle capitalize">{s.status}</span></h1>
      <section className="card"><dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {facts.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="text-[var(--ink-soft)]">{k}</dt><dd className="font-medium">{String(v)}</dd></div>)}
        {((guardians.data ?? []) as unknown as Guardian[]).map((g) => <div key={g.guardians.phone}><dt className="text-[var(--ink-soft)]">{g.guardians.relation}</dt><dd className="font-medium">{g.guardians.full_name}, {g.guardians.phone}</dd></div>)}
      </dl></section>
      {canManage && <section className="card"><h2 className="section-title">Life-cycle status</h2>
        <ActionForm action={updateStatus} className="form-grid" resetOnOk={false}>
          <input type="hidden" name="id" value={id} />
          <div><label className="label" htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={s.status} className="input capitalize">
              {["active", "suspended", "graduated", "alumni"].map((o) => <option key={o} value={o}>{o}</option>)}
            </select></div>
          <Submit className="btn btn-secondary">Update status</Submit>
        </ActionForm></section>}
      <section className="card"><h2 className="section-title">Attendance by class</h2>
        <ul className="space-y-1 text-sm">{((attendance.data ?? []) as Attendance[]).map((a) => <li key={a.section_id}>{a.attended} of {a.total} sessions ({a.percent ?? 0}%)</li>)}
          {!attendance.data?.length && <li>No attendance recorded yet.</li>}</ul></section>
      <section className="card"><h2 className="section-title">Documents</h2>
        <ul className="mb-3 space-y-1 text-sm">{links.map((d) => <li key={d.id}>{d.url ? <a className="text-[var(--brand)] underline" href={d.url} target="_blank" rel="noreferrer">{d.file_name}</a> : d.file_name} <span className="badge">{d.kind.replace("_", " ")}</span></li>)}
          {!links.length && <li>No documents uploaded.</li>}</ul>
        {canManage && <ActionForm action={uploadDocument} className="form-grid">
          <input type="hidden" name="student_id" value={id} />
          <div><label className="label" htmlFor="kind">Type</label><select id="kind" name="kind" className="input">
            <option value="marks_card">Marks card</option><option value="photo">Photo</option><option value="admission_voucher">Admission voucher</option><option value="other">Other</option></select></div>
          <div><label className="label" htmlFor="file">File (up to 10 MB)</label><input id="file" name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" className="input" /></div>
          <Submit className="btn btn-secondary">Upload</Submit>
        </ActionForm>}
      </section>
      <section className="card"><h2 className="section-title">Remarks</h2>
        <ul className="mb-3 space-y-2 text-sm">{((remarks.data ?? []) as Remark[]).map((r) => <li key={r.id}><span className="badge capitalize">{r.kind}</span> {r.body} <span className="text-[var(--ink-soft)]">({new Date(r.created_at).toLocaleDateString("en-IN")}{r.visible_to_parent ? ", shared with parents" : ", staff only"})</span></li>)}
          {!remarks.data?.length && <li>No remarks yet.</li>}</ul>
        {canRemark && <ActionForm action={addRemark} className="space-y-3">
          <input type="hidden" name="student_id" value={id} />
          <div className="form-grid"><div><label className="label" htmlFor="rkind">Type</label><select id="rkind" name="kind" className="input"><option value="remark">Remark</option><option value="incident">Incident</option><option value="appreciation">Appreciation</option></select></div>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="visible_to_parent" defaultChecked className="size-5" /> Show to parents</label></div>
          <div><label className="label" htmlFor="body">Remark</label><textarea id="body" name="body" required rows={3} className="input" /></div>
          <Submit className="btn btn-secondary">Save remark</Submit>
        </ActionForm>}
      </section>
    </div>
  );
}
