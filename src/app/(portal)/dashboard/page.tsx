import Link from "next/link";
import type { Metadata } from "next";
import { requireRole, type Profile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AttendanceHeatmap, type Day } from "@/components/heatmap";
import { BalanceCards, type Balance } from "@/components/ledger";
import { TIER_LABEL, TIERS } from "@/lib/roles";

export const metadata: Metadata = { title: "Dashboard" };
type Client = Awaited<ReturnType<typeof createClient>>;
type Stu = { id: string; full_name: string; enrollment_no: string; tier: keyof typeof TIER_LABEL };
type Summary = { section_id: string; attended: number; total: number; percent: number | null };
type Sec = { id: string; name: string; courses: { code: string; title: string } };
type Alert = { id: string; percent: number; students: { id: string; full_name: string; enrollment_no: string }; sections: { courses: { code: string } } };
type Remark = { id: string; kind: string; body: string; created_at: string };

async function FamilyView({ supabase, role }: { supabase: Client; role: string }) {
  const { data } = await supabase.from("students").select("id, full_name, enrollment_no, tier");
  const students: Stu[] = data ?? [];
  if (!students.length) return <p className="card">No student record is linked to this account yet. Please contact the college office.</p>;
  const { data: policies } = await supabase.from("attendance_policies").select("tier, min_percent");
  const limit = new Map(((policies ?? []) as { tier: string; min_percent: number }[]).map((p) => [p.tier, Number(p.min_percent)]));
  const blocks = await Promise.all(students.map(async (s) => {
    const [sum, days, bal, remarks] = await Promise.all([
      supabase.from("attendance_summary").select("section_id, attended, total, percent").eq("student_id", s.id),
      supabase.from("attendance_records").select("status, attendance_sessions(session_date)").eq("student_id", s.id).limit(1000),
      supabase.from("student_fee_balance").select("*").eq("student_id", s.id).maybeSingle(),
      role === "parent" ? supabase.from("student_remarks").select("id, kind, body, created_at").eq("student_id", s.id).order("created_at", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
    ]);
    const summary = (sum.data ?? []) as Summary[];
    const ids = summary.map((x) => x.section_id);
    const { data: secs } = ids.length ? await supabase.from("sections").select("id, name, courses(code, title)").in("id", ids) : { data: [] };
    const names = new Map(((secs ?? []) as unknown as Sec[]).map((x) => [x.id, `${x.courses.code} ${x.courses.title}`]));
    const attended = summary.reduce((a, x) => a + x.attended, 0), total = summary.reduce((a, x) => a + x.total, 0);
    return {
      s, summary, names, overall: total ? Math.round((attended / total) * 1000) / 10 : null,
      days: ((days.data ?? []) as unknown as { status: Day["status"]; attendance_sessions: { session_date: string } }[]).map((d) => ({ date: d.attendance_sessions.session_date, status: d.status })),
      balance: bal.data as Balance | null, remarks: (remarks.data ?? []) as Remark[],
    };
  }));
  return <div className="space-y-6">{blocks.map(({ s, summary, names, overall, days, balance, remarks }) => {
    const min = limit.get(s.tier) ?? 75;
    return <section key={s.id} aria-label={s.full_name} className="space-y-3">
      <h2 className="text-lg font-semibold">{s.full_name} <span className="text-sm font-normal text-[var(--ink-soft)]">{s.enrollment_no}, {TIER_LABEL[s.tier]}</span></h2>
      {overall !== null && overall < min && <p className="alert-error">Attendance is {overall}%, below the required {min}%.</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="card"><h3 className="section-title">Attendance {overall !== null && <span className="badge">{overall}% overall</span>}</h3><AttendanceHeatmap days={days} /></div>
        <div className="card"><h3 className="section-title">By subject</h3><ul className="space-y-2 text-sm">{summary.map((x) => {
          const low = (x.percent ?? 100) < min;
          return <li key={x.section_id}><div className="flex justify-between gap-2"><span>{names.get(x.section_id)}</span><span className={low ? "font-semibold text-[var(--bad)]" : ""}>{x.percent ?? 0}%</span></div>
            <div className="h-1.5 rounded bg-[var(--muted)]"><div className={`h-1.5 rounded ${low ? "bg-[var(--bad)]" : "bg-[var(--ok)]"}`} style={{ width: `${x.percent ?? 0}%` }} /></div></li>;
        })}{!summary.length && <li>No attendance recorded yet.</li>}</ul></div>
      </div>
      <BalanceCards balance={balance} />
      {remarks.length > 0 && <div className="card"><h3 className="section-title">Teacher remarks</h3><ul className="space-y-2 text-sm">{remarks.map((r) => <li key={r.id}><span className="badge capitalize">{r.kind}</span> {r.body} <span className="text-[var(--ink-soft)]">({new Date(r.created_at).toLocaleDateString("en-IN")})</span></li>)}</ul></div>}
    </section>;
  })}</div>;
}

async function StaffView({ supabase, profile }: { supabase: Client; profile: Profile }) {
  const isFaculty = profile.role === "faculty" || profile.role === "lab_technician";
  const { data: alerts } = await supabase.from("attendance_alerts").select("id, percent, students(id, full_name, enrollment_no), sections(courses(code))").is("resolved_at", null).order("percent").limit(20);
  const alertRows = (alerts ?? []) as unknown as Alert[];
  const counts = isFaculty ? [] : await Promise.all(TIERS.map(async (t) => ({
    tier: t, count: (await supabase.from("students").select("id", { count: "exact", head: true }).eq("tier", t).eq("status", "active")).count ?? 0,
  })));
  const { data: mine } = isFaculty ? await supabase.from("faculty_assignments").select("sections(id, name, courses(code, title))").eq("faculty_id", profile.id) : { data: [] };
  const classes = ((mine ?? []) as unknown as { sections: Sec }[]).map((m) => m.sections);
  return <div className="space-y-4">
    {counts.length > 0 && <dl className="grid gap-3 sm:grid-cols-3">{counts.map((c) => <div key={c.tier} className="card"><dt className="text-sm text-[var(--ink-soft)]">{TIER_LABEL[c.tier]} students</dt><dd className="text-2xl font-bold">{c.count}</dd></div>)}</dl>}
    {isFaculty && <section className="card"><h2 className="section-title">Your classes</h2><ul className="space-y-1 text-sm">{classes.map((c) => <li key={c.id}>{c.courses.code} {c.courses.title} ({c.name})</li>)}{!classes.length && <li>No classes assigned yet.</li>}</ul>
      <Link href="/attendance" className="btn btn-primary mt-3">Mark attendance</Link></section>}
    <section className="card"><h2 className="section-title">Low attendance alerts</h2><ul className="space-y-1 text-sm">{alertRows.map((a) => <li key={a.id}><Link href={`/students/${a.students.id}`} className="font-medium text-[var(--brand)] underline">{a.students.full_name}</Link> ({a.students.enrollment_no}): {a.percent}% in {a.sections.courses.code}</li>)}{!alertRows.length && <li>No students are below the limit.</li>}</ul></section>
  </div>;
}

export default async function DashboardPage() {
  const profile = await requireRole();
  const supabase = await createClient();
  const family = profile.role === "parent" || profile.role === "student";
  return <><h1 className="page-title">Welcome, {profile.full_name}</h1>
    {family ? <FamilyView supabase={supabase} role={profile.role} /> : <StaffView supabase={supabase} profile={profile} />}</>;
}
