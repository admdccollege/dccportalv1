import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AttendanceMarker } from "@/components/attendance-marker";
import type { CachedRoster } from "@/lib/offline";

export const metadata: Metadata = { title: "Attendance" };
const ADMIN = ["super_admin", "management", "principal"];

type SectionRow = { id: string; name: string; tier: string; courses: { code: string; title: string; category: string }; terms: { label: string; ends_on: string } };
type EnrollRow = { section_id: string; students: { id: string; full_name: string; enrollment_no: string; status: string } };

export default async function AttendancePage() {
  const profile = await requireRole(["super_admin", "management", "principal", "faculty", "lab_technician"]);
  const supabase = await createClient();
  let query = supabase.from("sections").select("id, name, tier, courses!inner(code, title, category), terms!inner(label, ends_on)");
  if (!ADMIN.includes(profile.role)) {
    const { data: mine } = await supabase.from("faculty_assignments").select("section_id").eq("faculty_id", profile.id);
    query = query.in("id", ((mine ?? []) as { section_id: string }[]).map((m) => m.section_id));
  }
  const today = new Date().toISOString().slice(0, 10);
  const { data: sections } = await query.gte("terms.ends_on", today);
  const rows = (sections ?? []) as unknown as SectionRow[];
  const { data: enrolled } = rows.length
    ? await supabase.from("enrollments").select("section_id, students!inner(id, full_name, enrollment_no, status)")
        .in("section_id", rows.map((r) => r.id)).eq("students.status", "active")
    : { data: [] };
  const rosters: CachedRoster[] = rows.map((s) => ({
    sectionId: s.id, tier: s.tier, savedAt: Date.now(),
    title: `${s.courses.code} ${s.courses.title} (${s.name}), ${s.terms.label}`,
    students: ((enrolled ?? []) as unknown as EnrollRow[]).filter((e) => e.section_id === s.id).map((e) => e.students)
      .map(({ id, full_name, enrollment_no }) => ({ id, full_name, enrollment_no }))
      .sort((a, b) => a.enrollment_no.localeCompare(b.enrollment_no)),
  }));
  return (
    <>
      <h1 className="page-title">Mark attendance</h1>
      <AttendanceMarker initialRosters={rosters} />
    </>
  );
}
