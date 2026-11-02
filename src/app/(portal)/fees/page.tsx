import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BalanceCards, LedgerTable, PaymentsTable, inr, type Balance, type Entry, type Payment } from "@/components/ledger";

export const metadata: Metadata = { title: "Fees" };
type Stu = { id: string; full_name: string; enrollment_no: string };

export default async function FeesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const profile = await requireRole(["super_admin", "management", "principal", "office_staff", "parent", "student"]);
  const supabase = await createClient();
  const family = profile.role === "parent" || profile.role === "student";
  if (family) {
    const { data } = await supabase.from("students").select("id, full_name, enrollment_no");
    const students: Stu[] = data ?? [];
    const details = await Promise.all(students.map(async (s) => {
      const [b, l, p] = await Promise.all([
        supabase.from("student_fee_balance").select("*").eq("student_id", s.id).maybeSingle(),
        supabase.from("ledger_entries").select("*").eq("student_id", s.id).order("created_at", { ascending: false }),
        supabase.from("payments").select("*").eq("student_id", s.id).order("paid_on", { ascending: false }),
      ]);
      return { s, balance: b.data as Balance | null, entries: (l.data ?? []) as Entry[], payments: (p.data ?? []) as Payment[] };
    }));
    return <div className="space-y-6"><h1 className="page-title mb-0">Fees</h1>
      {details.map(({ s, balance, entries, payments }) => <section key={s.id} className="space-y-3" aria-label={s.full_name}>
        <h2 className="text-lg font-semibold">{s.full_name} ({s.enrollment_no})</h2>
        <BalanceCards balance={balance} /><PaymentsTable payments={payments} /><LedgerTable entries={entries} />
      </section>)}
      {!details.length && <p className="card">No fee records are linked to your account.</p>}
    </div>;
  }
  const { q = "" } = await searchParams;
  const term = q.replace(/[,()%*\\]/g, " ").trim();
  let query = supabase.from("students").select("id, full_name, enrollment_no").order("enrollment_no").limit(50);
  if (term) query = query.or(`full_name.ilike.%${term}%,enrollment_no.ilike.%${term}%`);
  const { data } = await query;
  const rows: Stu[] = data ?? [];
  const { data: bal } = rows.length ? await supabase.from("student_fee_balance").select("student_id, outstanding").in("student_id", rows.map((r) => r.id)) : { data: [] };
  const owed = new Map(((bal ?? []) as { student_id: string; outstanding: number }[]).map((b) => [b.student_id, b.outstanding]));
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="page-title mb-0">Fees</h1>
      {profile.role !== "office_staff" && <Link href="/fees/structures" className="btn btn-secondary">Fee structures</Link>}</div>
    <form className="card form-grid"><div><label className="label" htmlFor="q">Find a student</label><input id="q" name="q" defaultValue={q} className="input" placeholder="Name or enrollment number" /></div><button className="btn btn-secondary">Search</button></form>
    <div className="card overflow-x-auto"><table className="data-table"><thead><tr><th>Enrollment</th><th>Name</th><th className="text-right">Outstanding</th></tr></thead>
      <tbody>{rows.map((s) => <tr key={s.id}><td><Link className="font-medium text-[var(--brand)] underline" href={`/fees/${s.id}`}>{s.enrollment_no}</Link></td><td>{s.full_name}</td><td className="text-right">{inr(owed.get(s.id) ?? 0)}</td></tr>)}
        {!rows.length && <tr><td colSpan={3}>No students found.</td></tr>}</tbody></table></div>
  </div>;
}
