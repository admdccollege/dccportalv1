import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Submit } from "@/components/action-form";
import { addSlot, removeSlot } from "./actions";

export const metadata: Metadata = { title: "Timetable" };
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const time = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
type Slot = { id: string; weekday: number; start_minute: number; end_minute: number; room: string | null; section_id: string; faculty_id: string; sections: { name: string; courses: { code: string; title: string } }; profiles: { full_name: string } };
type Section = { id: string; name: string; courses: { code: string; title: string }; terms: { label: string } };

export default async function TimetablePage() {
  const profile = await requireRole();
  const supabase = await createClient();
  const isAdmin = ["super_admin", "management", "principal"].includes(profile.role);
  const { data: year } = await supabase.from("academic_years").select("id, label").eq("is_current", true).maybeSingle();
  if (!year) return <><h1 className="page-title">Timetable</h1><p className="card">No current academic year has been set up.</p></>;
  let query = supabase.from("timetable_slots").select("id, weekday, start_minute, end_minute, room, section_id, faculty_id, sections(name, courses(code, title)), profiles(full_name)")
    .eq("academic_year_id", year.id).order("weekday").order("start_minute");
  if (profile.role === "faculty") query = query.eq("faculty_id", profile.id);
  if (profile.role === "student" || profile.role === "parent") {
    const { data: enrolled } = await supabase.from("enrollments").select("section_id");
    query = query.in("section_id", ((enrolled ?? []) as { section_id: string }[]).map((e) => e.section_id));
  }
  const { data } = await query;
  const slots = (data ?? []) as unknown as Slot[];
  const [sections, faculty, workload] = isAdmin ? await Promise.all([
    supabase.from("sections").select("id, name, courses!inner(code, title), terms!inner(label, academic_year_id)").eq("terms.academic_year_id", year.id),
    supabase.from("profiles").select("id, full_name").in("role", ["faculty", "lab_technician"]).eq("is_active", true).order("full_name"),
    supabase.from("faculty_workload").select("faculty_id, weekly_slots, weekly_hours").eq("academic_year_id", year.id),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const facultyRows = (faculty.data ?? []) as { id: string; full_name: string }[];
  const names = new Map(facultyRows.map((f) => [f.id, f.full_name]));
  return <div className="space-y-4">
    <h1 className="page-title mb-0">Timetable <span className="text-base font-normal text-[var(--ink-soft)]">{year.label}</span></h1>
    {isAdmin && <section className="card"><h2 className="section-title">Add a class</h2>
      <p className="mb-3 text-sm text-[var(--ink-soft)]">Clashes for a teacher or room are refused across all tiers.</p>
      <ActionForm action={addSlot} className="form-grid">
        <input type="hidden" name="academic_year_id" value={year.id} />
        <div><label className="label" htmlFor="section_id">Class</label><select id="section_id" name="section_id" required className="input">{((sections.data ?? []) as unknown as Section[]).map((s) => <option key={s.id} value={s.id}>{s.courses.code} {s.courses.title} ({s.name}), {s.terms.label}</option>)}</select></div>
        <div><label className="label" htmlFor="faculty_id">Faculty</label><select id="faculty_id" name="faculty_id" required className="input">{facultyRows.map((f) => <option key={f.id} value={f.id}>{f.full_name}</option>)}</select></div>
        <div><label className="label" htmlFor="weekday">Day</label><select id="weekday" name="weekday" className="input">{DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></div>
        <div><label className="label" htmlFor="start">Start</label><input id="start" name="start" type="time" required className="input" /></div>
        <div><label className="label" htmlFor="end">End</label><input id="end" name="end" type="time" required className="input" /></div>
        <div><label className="label" htmlFor="room">Room</label><input id="room" name="room" className="input" /></div>
        <Submit>Add class</Submit>
      </ActionForm></section>}
    {DAYS.map((d, i) => {
      const today = slots.filter((s) => s.weekday === i + 1);
      if (!today.length) return null;
      return <section key={d} className="card"><h2 className="section-title">{d}</h2><ul className="divide-y divide-[var(--muted)] text-sm">
        {today.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span><span className="font-medium">{time(s.start_minute)}–{time(s.end_minute)}</span> {s.sections.courses.code} {s.sections.courses.title} ({s.sections.name})<br /><span className="text-[var(--ink-soft)]">{s.profiles.full_name}{s.room ? `, ${s.room}` : ""}</span></span>
          {isAdmin && <ActionForm action={removeSlot}><input type="hidden" name="id" value={s.id} /><Submit className="btn btn-danger">Remove</Submit></ActionForm>}
        </li>)}
      </ul></section>;
    })}
    {!slots.length && <p className="card">No classes are scheduled yet.</p>}
    {isAdmin && !!workload.data?.length && <section className="card overflow-x-auto"><h2 className="section-title">Faculty workload</h2><table className="data-table"><thead><tr><th>Faculty</th><th>Classes a week</th><th>Hours a week</th></tr></thead>
      <tbody>{(workload.data as { faculty_id: string; weekly_slots: number; weekly_hours: number }[]).map((w) => <tr key={w.faculty_id}><td>{names.get(w.faculty_id) ?? "Unknown"}</td><td>{w.weekly_slots}</td><td>{w.weekly_hours}</td></tr>)}</tbody></table></section>}
  </div>;
}
