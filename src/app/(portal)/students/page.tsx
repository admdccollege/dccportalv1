import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TIER_LABEL, TIERS, type Tier } from "@/lib/roles";

export const metadata: Metadata = { title: "Students" };
const PAGE = 50;
type Row = { id: string; full_name: string; enrollment_no: string; tier: Tier; status: string; class_level: string | null; semester: number | null };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; tier?: string; page?: string }> }) {
  const profile = await requireRole(["super_admin", "management", "principal", "exam_cell", "faculty", "office_staff"]);
  const { q = "", tier = "", page = "1" } = await searchParams;
  const pageNo = Math.max(1, Number(page) || 1);
  const supabase = await createClient();
  let query = supabase.from("students").select("id, full_name, enrollment_no, tier, status, class_level, semester", { count: "exact" })
    .order("enrollment_no").range((pageNo - 1) * PAGE, pageNo * PAGE - 1);
  if (TIERS.includes(tier as Tier)) query = query.eq("tier", tier);
  // Commas and brackets would change the meaning of the filter, so they're removed.
  const term = q.replace(/[,()%*\\]/g, " ").trim();
  if (term) query = query.or(`full_name.ilike.%${term}%,enrollment_no.ilike.%${term}%`);
  const { data, count, error } = await query;
  const rows: Row[] = data ?? [];
  const canAdd = ["super_admin", "management", "principal", "office_staff"].includes(profile.role);
  const params = (p: number) => `/students?${new URLSearchParams({ q, tier, page: String(p) })}`;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title mb-0">Students</h1>
        {canAdd && <div className="flex gap-2">
          <Link href="/students/import" className="btn btn-secondary">Bulk upload</Link>
          <Link href="/students/new" className="btn btn-primary">Add student</Link>
        </div>}
      </div>
      <form className="card form-grid mb-4">
        <div><label className="label" htmlFor="q">Search</label><input id="q" name="q" defaultValue={q} className="input" placeholder="Name or enrollment number" /></div>
        <div><label className="label" htmlFor="tier">Tier</label>
          <select id="tier" name="tier" defaultValue={tier} className="input"><option value="">All tiers</option>{TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}</select></div>
        <button className="btn btn-secondary">Apply</button>
      </form>
      {error && <p className="alert-error mb-3">Could not load students. Please try again.</p>}
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Enrollment</th><th>Name</th><th>Tier</th><th>Class / Sem</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td><Link className="font-medium text-[var(--brand)] underline" href={`/students/${s.id}`}>{s.enrollment_no}</Link></td>
                <td>{s.full_name}</td><td>{TIER_LABEL[s.tier]}</td><td>{s.class_level ?? (s.semester ? `Sem ${s.semester}` : "")}</td>
                <td className="capitalize">{s.status}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5}>No students found.</td></tr>}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pages" className="mt-3 flex items-center justify-between text-sm">
        <span>{count ?? 0} students</span>
        <span className="flex gap-2">
          {pageNo > 1 && <Link className="btn btn-secondary" href={params(pageNo - 1)}>Previous</Link>}
          {(count ?? 0) > pageNo * PAGE && <Link className="btn btn-secondary" href={params(pageNo + 1)}>Next</Link>}
        </span>
      </nav>
    </>
  );
}
