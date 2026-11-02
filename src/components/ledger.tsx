export type Balance = { total_due: number; total_concession: number; total_paid: number; outstanding: number };
export type Entry = { id: string; entry_type: string; amount: number; description: string; created_at: string; due_on: string | null };
export type Payment = { id: string; receipt_no: string; amount: number; mode: string; paid_on: string; reference: string | null; voided_at: string | null };
export const inr = (n: number) => `₹${Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
const CREDIT = ["concession", "scholarship", "payment"];

export function BalanceCards({ balance }: { balance?: Balance | null }) {
  const b = balance ?? { total_due: 0, total_concession: 0, total_paid: 0, outstanding: 0 };
  return <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {([["Total due", b.total_due], ["Concessions", b.total_concession], ["Paid", b.total_paid], ["Outstanding", b.outstanding]] as const).map(([k, v]) => (
      <div key={k} className="card"><dt className="text-sm text-[var(--ink-soft)]">{k}</dt><dd className={`text-xl font-bold ${k === "Outstanding" && Number(v) > 0 ? "text-[var(--bad)]" : ""}`}>{inr(v)}</dd></div>
    ))}
  </dl>;
}

export function LedgerTable({ entries }: { entries: Entry[] }) {
  return <div className="card overflow-x-auto"><h2 className="section-title">Ledger</h2><table className="data-table">
    <thead><tr><th>Date</th><th>Description</th><th>Type</th><th className="text-right">Amount</th></tr></thead>
    <tbody>{entries.map((e) => <tr key={e.id}><td>{new Date(e.created_at).toLocaleDateString("en-IN")}</td><td>{e.description}{e.due_on && <span className="text-[var(--ink-soft)]"> (due {e.due_on})</span>}</td><td className="capitalize">{e.entry_type}</td>
      <td className="text-right">{CREDIT.includes(e.entry_type) ? "−" : "+"}{inr(e.amount)}</td></tr>)}
      {!entries.length && <tr><td colSpan={4}>No ledger entries yet.</td></tr>}</tbody>
  </table></div>;
}

export function PaymentsTable({ payments }: { payments: Payment[] }) {
  return <div className="card overflow-x-auto"><h2 className="section-title">Payments</h2><table className="data-table">
    <thead><tr><th>Receipt</th><th>Date</th><th>Mode</th><th className="text-right">Amount</th><th>PDF</th></tr></thead>
    <tbody>{payments.map((p) => <tr key={p.id}><td>{p.receipt_no}{p.voided_at && <span className="badge ml-1">Void</span>}</td><td>{p.paid_on}</td><td className="capitalize">{p.mode.replace("_", " ")}</td><td className="text-right">{inr(p.amount)}</td>
      <td><a className="btn btn-secondary" href={`/api/receipt/${p.id}`}>Receipt</a></td></tr>)}
      {!payments.length && <tr><td colSpan={5}>No payments yet.</td></tr>}</tbody>
  </table></div>;
}
