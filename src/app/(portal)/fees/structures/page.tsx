import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Submit } from "@/components/action-form";
import { TIER_LABEL, TIERS, type Tier } from "@/lib/roles";
import { inr } from "@/components/ledger";
import { assignStructure, createStructure } from "../actions";

export const metadata = { title: "Fee structures" };
type Opt = { id: string; label?: string; name?: string; code?: string };
type Structure = { id: string; label: string; tier: Tier; period_no: number; due_on: string | null; fee_structure_items: { amount: number; fee_heads: { name: string } }[] };

export default async function StructuresPage() {
  await requireRole(["super_admin", "management", "principal"]);
  const supabase = await createClient();
  const [heads, years, programs, structures] = await Promise.all([
    supabase.from("fee_heads").select("id, name, code").neq("code", "LIBRARY_FINE").order("name"),
    supabase.from("academic_years").select("id, label").order("starts_on", { ascending: false }),
    supabase.from("programs").select("id, name").order("name"),
    supabase.from("fee_structures").select("id, label, tier, period_no, due_on, fee_structure_items(amount, fee_heads(name))").order("label"),
  ]);
  return <div className="space-y-4">
    <h1 className="page-title mb-0">Fee structures</h1>
    <section className="card"><h2 className="section-title">New fee structure</h2>
      <ActionForm action={createStructure} className="space-y-4">
        <div className="form-grid">
          <div><label className="label" htmlFor="label">Label</label><input id="label" name="label" required className="input" placeholder="UG Semester I 2026-27" /></div>
          <div><label className="label" htmlFor="tier">Tier</label><select id="tier" name="tier" className="input">{TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}</select></div>
          <div><label className="label" htmlFor="academic_year_id">Academic year</label><select id="academic_year_id" name="academic_year_id" required className="input">{((years.data ?? []) as Opt[]).map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select></div>
          <div><label className="label" htmlFor="program_id">Program</label><select id="program_id" name="program_id" className="input"><option value="">All programs in tier</option>{((programs.data ?? []) as Opt[]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label className="label" htmlFor="period_no">Semester no. (HS: XI = 1, XII = 2)</label><input id="period_no" name="period_no" type="number" min="1" max="12" defaultValue="1" className="input" /></div>
          <div><label className="label" htmlFor="due_on">Due date</label><input id="due_on" name="due_on" type="date" className="input" /></div>
        </div>
        <fieldset><legend className="label">Amounts by fee head (₹)</legend><div className="form-grid">
          {((heads.data ?? []) as Opt[]).map((h) => <div key={h.id}><label className="label" htmlFor={h.id}>{h.name}</label><input id={h.id} name={`head:${h.id}`} type="number" min="0" step="0.01" className="input" /></div>)}
        </div></fieldset>
        <Submit>Create fee structure</Submit>
      </ActionForm></section>
    {((structures.data ?? []) as unknown as Structure[]).map((s) => <section key={s.id} className="card">
      <h2 className="font-semibold">{s.label}</h2>
      <p className="text-sm text-[var(--ink-soft)]">{TIER_LABEL[s.tier]}, period {s.period_no}{s.due_on ? `, due ${s.due_on}` : ""}</p>
      <ul className="my-2 text-sm">{s.fee_structure_items.map((i) => <li key={i.fee_heads.name}>{i.fee_heads.name}: {inr(i.amount)}</li>)}</ul>
      <ActionForm action={assignStructure}><input type="hidden" name="structure_id" value={s.id} /><Submit className="btn btn-secondary">Charge all matching active students</Submit></ActionForm>
    </section>)}
  </div>;
}
