import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Submit } from "@/components/action-form";
import { TIER_LABEL, TIERS } from "@/lib/roles";
import { addRow, addSection, assignFaculty, enrollStudents } from "./actions";

export const metadata: Metadata = { title: "Academic setup" };
type Opt = { id: string; label?: string; name?: string; code?: string; title?: string; full_name?: string };
type Sec = { id: string; name: string; courses: { code: string; title: string }; terms: { label: string } };

const TierSelect = ({ id }: { id: string }) => <div><label className="label" htmlFor={id}>Tier</label><select id={id} name="tier" className="input">{TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}</select></div>;
const Input = ({ id, name, label, ...rest }: { id: string; name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) => <div><label className="label" htmlFor={id}>{label}</label><input id={id} name={name} className="input" {...rest} /></div>;
const Pick = ({ id, name, label, options, show, blank }: { id: string; name: string; label: string; options: Opt[]; show: (o: Opt) => string; blank?: string }) =>
  <div><label className="label" htmlFor={id}>{label}</label><select id={id} name={name} required={!blank} className="input">{blank && <option value="">{blank}</option>}{options.map((o) => <option key={o.id} value={o.id}>{show(o)}</option>)}</select></div>;

export default async function SetupPage() {
  await requireRole(["super_admin", "management", "principal"]);
  const supabase = await createClient();
  const [d, y, p, t, c, s, f] = await Promise.all([
    supabase.from("departments").select("id, code, name").order("name"),
    supabase.from("academic_years").select("id, label").order("starts_on", { ascending: false }),
    supabase.from("programs").select("id, code, name").order("name"),
    supabase.from("terms").select("id, label").order("starts_on", { ascending: false }),
    supabase.from("courses").select("id, code, title").order("code"),
    supabase.from("sections").select("id, name, courses(code, title), terms(label)").limit(500),
    supabase.from("profiles").select("id, full_name").in("role", ["faculty", "lab_technician"]).eq("is_active", true).order("full_name"),
  ]);
  const depts = (d.data ?? []) as Opt[], years = (y.data ?? []) as Opt[], programs = (p.data ?? []) as Opt[], terms = (t.data ?? []) as Opt[], courses = (c.data ?? []) as Opt[], faculty = (f.data ?? []) as Opt[];
  const sections: Opt[] = ((s.data ?? []) as unknown as Sec[]).map((x) => ({ id: x.id, title: `${x.courses.code} ${x.courses.title} (${x.name}), ${x.terms.label}` }));
  return <div className="space-y-4">
    <h1 className="page-title mb-0">Academic setup</h1>
    <p className="text-sm text-[var(--ink-soft)]">Work from top to bottom: each step uses what you added above it.</p>
    <section className="card"><h2 className="section-title">1. Departments ({depts.length})</h2><ActionForm action={addRow.bind(null, "departments")} className="form-grid">
      <Input id="d_code" name="code" label="Code" required placeholder="HIS" /><Input id="d_name" name="name" label="Name" required /><Submit>Add</Submit></ActionForm></section>
    <section className="card"><h2 className="section-title">2. Academic years ({years.length})</h2><ActionForm action={addRow.bind(null, "academic_years")} className="form-grid">
      <Input id="y_label" name="label" label="Label" required placeholder="2026-27" /><Input id="y_s" name="starts_on" label="Starts" type="date" required /><Input id="y_e" name="ends_on" label="Ends" type="date" required />
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="is_current" className="size-5" /> Current year</label><Submit>Add</Submit></ActionForm></section>
    <section className="card"><h2 className="section-title">3. Programs ({programs.length})</h2><ActionForm action={addRow.bind(null, "programs")} className="form-grid">
      <TierSelect id="p_t" /><Input id="p_c" name="code" label="Code" required placeholder="BA-HIS" /><Input id="p_n" name="name" label="Name" required /><Pick id="p_d" name="department_id" label="Department" options={depts} show={(o) => o.name!} blank="None" />
      <Input id="p_tt" name="total_terms" label="Total years/semesters" type="number" min="1" max="12" required /><Submit>Add</Submit></ActionForm></section>
    <section className="card"><h2 className="section-title">4. Terms ({terms.length})</h2><ActionForm action={addRow.bind(null, "terms")} className="form-grid">
      <Pick id="t_y" name="academic_year_id" label="Academic year" options={years} show={(o) => o.label!} /><TierSelect id="t_t" /><Input id="t_n" name="term_no" label="Term no." type="number" min="1" max="12" required />
      <Input id="t_l" name="label" label="Label" required placeholder="UG Semester I" /><Input id="t_s" name="starts_on" label="Starts" type="date" required /><Input id="t_e" name="ends_on" label="Ends" type="date" required /><Submit>Add</Submit></ActionForm></section>
    <section className="card"><h2 className="section-title">5. Courses and papers ({courses.length})</h2><ActionForm action={addRow.bind(null, "courses")} className="form-grid">
      <TierSelect id="c_t" /><Input id="c_c" name="code" label="Code" required /><Input id="c_n" name="title" label="Title" required />
      <div><label className="label" htmlFor="c_k">Category</label><select id="c_k" name="category" className="input">
        {[["core", "Core subject"], ["major", "Major"], ["minor", "Minor"], ["skill_enhancement", "Skill Enhancement"], ["value_added", "Value-Added"], ["lab_practical", "Lab Practical"], ["elective", "Elective"], ["specialization", "Specialization"], ["seminar", "Seminar"], ["thesis", "Thesis"], ["class_group", "Class group (daily HS attendance, not graded)"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <Input id="c_cr" name="credits" label="Credits" type="number" min="0" step="0.5" defaultValue="0" required /><Pick id="c_p" name="program_id" label="Program" options={programs} show={(o) => o.name!} blank="None" /><Pick id="c_d" name="department_id" label="Department" options={depts} show={(o) => o.name!} blank="None" /><Submit>Add</Submit></ActionForm></section>
    <section className="card"><h2 className="section-title">6. Class sections ({sections.length})</h2><ActionForm action={addSection} className="form-grid">
      <Pick id="s_c" name="course_id" label="Course" options={courses} show={(o) => `${o.code} ${o.title}`} /><Pick id="s_t" name="term_id" label="Term" options={terms} show={(o) => o.label!} /><Input id="s_n" name="name" label="Section" defaultValue="A" required /><Pick id="s_f" name="faculty_id" label="Faculty" options={faculty} show={(o) => o.full_name!} blank="Assign later" /><Submit>Add</Submit></ActionForm></section>
    <section className="card"><h2 className="section-title">7. Assign more faculty</h2><ActionForm action={assignFaculty} className="form-grid">
      <Pick id="a_f" name="faculty_id" label="Faculty" options={faculty} show={(o) => o.full_name!} /><Pick id="a_s" name="section_id" label="Class" options={sections} show={(o) => o.title!} /><Submit>Assign</Submit></ActionForm></section>
    <section className="card"><h2 className="section-title">8. Enroll students</h2><ActionForm action={enrollStudents} className="space-y-3">
      <Pick id="e_s" name="section_id" label="Class" options={sections} show={(o) => o.title!} />
      <div><label className="label" htmlFor="enrollment_nos">Enrollment numbers (paste from a spreadsheet)</label><textarea id="enrollment_nos" name="enrollment_nos" rows={4} required className="input" /></div><Submit>Enroll</Submit></ActionForm></section>
  </div>;
}
