import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Submit } from "@/components/action-form";
import { publishTerm } from "./actions";

export const metadata: Metadata = { title: "Results" };
type Result = { id: string; sgpa: number | null; cgpa: number | null; percentage: number | null; division: string | null; published_at: string; students: { full_name: string; enrollment_no: string }; terms: { label: string } };

export default async function ResultsPage() {
  const profile = await requireRole();
  const supabase = await createClient();
  const canPublish = ["super_admin", "management", "principal", "exam_cell"].includes(profile.role);
  const [{ data }, terms] = await Promise.all([
    supabase.from("term_results").select("id, sgpa, cgpa, percentage, division, published_at, students(full_name, enrollment_no), terms(label)")
      .eq("is_published", true).order("published_at", { ascending: false }).limit(200),
    canPublish ? supabase.from("terms").select("id, label").order("starts_on", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const rows = (data ?? []) as unknown as Result[];
  return (
    <div className="space-y-4">
      <h1 className="page-title mb-0">Results</h1>
      {canPublish && <section className="card"><h2 className="section-title">Publish a term</h2>
        <p className="mb-3 text-sm text-[var(--ink-soft)]">Works out grades for every enrolled student, using marks entered so far. Missing marks count as zero, and republishing issues a new verification hash, so publish only when marks are final.</p>
        <ActionForm action={publishTerm} className="form-grid">
          <div><label className="label" htmlFor="term_id">Term</label><select id="term_id" name="term_id" required className="input">
            {((terms.data ?? []) as { id: string; label: string }[]).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
          <Submit>Publish results</Submit>
        </ActionForm></section>}
      <section className="card overflow-x-auto"><table className="data-table">
        <thead><tr><th>Student</th><th>Term</th><th>Result</th><th>Mark sheet</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.id}>
            <td>{r.students.full_name}<br /><span className="text-xs text-[var(--ink-soft)]">{r.students.enrollment_no}</span></td>
            <td>{r.terms.label}</td>
            <td>{r.sgpa !== null ? `SGPA ${r.sgpa}, CGPA ${r.cgpa}` : `${r.percentage}%, ${r.division}`}</td>
            <td><a className="btn btn-secondary" href={`/api/marksheet/${r.id}`}>Download PDF</a></td>
          </tr>)}
          {!rows.length && <tr><td colSpan={4}>No results have been published yet.</td></tr>}
        </tbody>
      </table></section>
    </div>
  );
}
