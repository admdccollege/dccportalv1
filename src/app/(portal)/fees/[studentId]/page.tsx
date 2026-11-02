import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Submit } from "@/components/action-form";
import { BalanceCards, LedgerTable, PaymentsTable, inr, type Balance, type Entry, type Payment } from "@/components/ledger";
import { addConcession, recordPayment, voidPayment } from "../actions";

export default async function StudentFeesPage({ params }: { params: Promise<{ studentId: string }> }) {
  const profile = await requireRole(["super_admin", "management", "principal", "office_staff"]);
  const { studentId: id } = await params;
  const supabase = await createClient();
  const { data: s } = await supabase.from("students").select("full_name, enrollment_no").eq("id", id).maybeSingle();
  if (!s) notFound();
  const [b, l, p] = await Promise.all([
    supabase.from("student_fee_balance").select("*").eq("student_id", id).maybeSingle(),
    supabase.from("ledger_entries").select("*").eq("student_id", id).order("created_at", { ascending: false }),
    supabase.from("payments").select("*").eq("student_id", id).order("paid_on", { ascending: false }),
  ]);
  const payments = (p.data ?? []) as Payment[];
  const isAdmin = profile.role !== "office_staff";
  const today = new Date().toISOString().slice(0, 10);
  return <div className="space-y-4">
    <h1 className="page-title mb-0">{s.full_name} <span className="text-base font-normal text-[var(--ink-soft)]">{s.enrollment_no}</span></h1>
    <BalanceCards balance={b.data as Balance | null} />
    <section className="card"><h2 className="section-title">Record a payment</h2>
      <ActionForm action={recordPayment} className="form-grid">
        <input type="hidden" name="student_id" value={id} />
        <div><label className="label" htmlFor="amount">Amount (₹)</label><input id="amount" name="amount" type="number" min="0.01" step="0.01" required className="input" /></div>
        <div><label className="label" htmlFor="mode">Mode</label><select id="mode" name="mode" className="input"><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option></select></div>
        <div><label className="label" htmlFor="reference">Reference (UPI/bank)</label><input id="reference" name="reference" className="input" /></div>
        <div><label className="label" htmlFor="paid_on">Date</label><input id="paid_on" name="paid_on" type="date" defaultValue={today} max={today} required className="input" /></div>
        <Submit>Issue receipt</Submit>
      </ActionForm></section>
    {isAdmin && <section className="card"><h2 className="section-title">Add a concession or scholarship</h2>
      <ActionForm action={addConcession} className="form-grid">
        <input type="hidden" name="student_id" value={id} />
        <div><label className="label" htmlFor="entry_type">Type</label><select id="entry_type" name="entry_type" className="input"><option value="concession">Concession</option><option value="scholarship">Scholarship</option></select></div>
        <div><label className="label" htmlFor="c_amount">Amount (₹)</label><input id="c_amount" name="amount" type="number" min="0.01" step="0.01" required className="input" /></div>
        <div><label className="label" htmlFor="description">Description</label><input id="description" name="description" required className="input" /></div>
        <Submit className="btn btn-secondary">Add to ledger</Submit>
      </ActionForm></section>}
    <PaymentsTable payments={payments} />
    {isAdmin && payments.some((x) => !x.voided_at) && <section className="card"><h2 className="section-title">Void a payment</h2>
      <p className="mb-3 text-sm text-[var(--ink-soft)]">The receipt stays on record, marked void, and the amount returns to the balance.</p>
      <ActionForm action={voidPayment} className="form-grid">
        <input type="hidden" name="student_id" value={id} />
        <div><label className="label" htmlFor="payment_id">Payment</label><select id="payment_id" name="payment_id" className="input">
          {payments.filter((x) => !x.voided_at).map((x) => <option key={x.id} value={x.id}>{x.receipt_no}, {inr(x.amount)}</option>)}</select></div>
        <div><label className="label" htmlFor="reason">Reason</label><input id="reason" name="reason" required className="input" /></div>
        <Submit className="btn btn-danger">Void payment</Submit>
      </ActionForm></section>}
    <LedgerTable entries={(l.data ?? []) as Entry[]} />
  </div>;
}
