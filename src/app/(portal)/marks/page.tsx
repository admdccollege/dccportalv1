import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Submit } from "@/components/action-form";
import { Gradebook, type Assessment, type Student } from "@/components/gradebook";
import { createAssessment } from "./actions";

export const metadata: Metadata = { title: "Marks" };
const ADMINISH = ["super_admin", "management", "principal", "exam_cell"];
type Section = { id: string; name: string; tier: string; courses: { code: string; title: string }; terms: { label: string } };
const KINDS: Record<string, [string, string][]> = {
  higher_secondary: [["unit_test", "Unit test"], ["midterm", "Midterm"], ["pre_board", "Pre-Board"], ["practical_record", "Practical record"]],
  college: [["cia_1", "CIA 1"], ["cia_2", "CIA 2"], ["assignment", "Assignment"], ["seminar", "Seminar"], ["lab_practical", "Lab practical"], ["semester_end", "Semester end exam"], ["thesis", "Thesis"]],
};

export default async function MarksPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const profile = await requireRole([...ADMINISH, "faculty", "lab_technician"] as never);
  const { section } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("sections").select("id, name, tier, courses!inner(code, title), terms!inner(label)");
  if (!ADMINISH.includes(profile.role)) {
    const { data: mine } = await supabase.from("faculty_assignments").select("section_id").eq("faculty_id", profile.id);
    query = query.in("id", ((mine ?? []) as { section_id: string }[]).map((m) => m.section_id));
  }
  const { data } = await query;
  const sections = (data ?? []) as unknown as Section[];
  const current = sections.find((s) => s.id === section) ?? sections[0];
  let assessments: Assessment[] = [];
  let students: Student[] = [];
  let marks: { assessment_id: string; student_id: string; marks: number | null; is_absent: boolean }[] = [];
  if (current) {
    const [a, e] = await Promise.all([
      supabase.from("assessments").select("id, name, kind, max_marks, weightage, is_published").eq("section_id", current.id).order("created_at"),
      supabase.from("enrollments").select("students!inner(id, full_name, enrollment_no, status)").eq("section_id", current.id).eq("students.status", "active"),
    ]);
    assessments = a.data ?? [];
    students = ((e.data ?? []) as unknown as { students: Student }[]).map((r) => r.students).sort((x, y) => x.enrollment_no.localeCompare(y.enrollment_no));
    if (assessments.length) {
      const m = await supabase.from("marks").select("assessment_id, student_id, marks, is_absent").in("assessment_id", assessments.map((x) => x.id));
      marks = m.data ?? [];
    }
  }
  const kinds = current?.tier === "higher_secondary" ? KINDS.higher_secondary : KINDS.college;
  return (
    <div className="space-y-4">
      <h1 className="page-title mb-0">Marks entry</h1>
      {!current ? <p className="card">No classes are assigned to you yet.</p> : <>
        <form className="card form-grid">
          <div><label className="label" htmlFor="section">Class</label>
            <select id="section" name="section" defaultValue={current.id} className="input">
              {sections.map((s) => <option key={s.id} value={s.id}>{s.courses.code} {s.courses.title} ({s.name}), {s.terms.label}</option>)}
            </select></div>
          <button className="btn btn-secondary">Open</button>
        </form>
        <Gradebook key={current.id} assessments={assessments} students={students} marks={marks} />
        <section className="card"><h2 className="section-title">Add an assessment</h2>
          <ActionForm action={createAssessment} className="form-grid">
            <input type="hidden" name="section_id" value={current.id} />
            <div><label className="label" htmlFor="name">Name</label><input id="name" name="name" required className="input" placeholder="CIA 1" /></div>
            <div><label className="label" htmlFor="kind">Type</label><select id="kind" name="kind" className="input">{kinds.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label className="label" htmlFor="max_marks">Maximum marks</label><input id="max_marks" name="max_marks" type="number" min="1" step="0.5" required className="input" /></div>
            <div><label className="label" htmlFor="weightage">Weightage (%)</label><input id="weightage" name="weightage" type="number" min="1" max="100" step="0.5" required className="input" /></div>
            <div><label className="label" htmlFor="exam_date">Date</label><input id="exam_date" name="exam_date" type="date" className="input" /></div>
            <Submit>Add assessment</Submit>
          </ActionForm>
        </section>
      </>}
    </div>
  );
}
