import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Submit } from "@/components/action-form";
import { TIER_LABEL, TIERS } from "@/lib/roles";
import { createStaff, resetPassword, setActive } from "./actions";

export const metadata: Metadata = { title: "Staff accounts" };
const ROLES: [string, string][] = [["faculty", "Faculty"], ["office_staff", "Office Staff"], ["lab_technician", "Lab Technician"], ["exam_cell", "Exam Cell"], ["principal", "Principal"], ["management", "Management"], ["super_admin", "Super Admin"]];
type Person = { id: string; full_name: string; email: string | null; role: string; is_active: boolean; is_hod: boolean };

export default async function PeoplePage() {
  await requireRole(["super_admin", "management", "principal"]);
  const supabase = await createClient();
  const [{ data }, d] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, is_active, is_hod").not("role", "in", "(parent,student)").order("full_name"),
    supabase.from("departments").select("id, name").order("name"),
  ]);
  return <div className="space-y-4">
    <h1 className="page-title mb-0">Staff accounts</h1>
    <section className="card"><h2 className="section-title">New account</h2>
      <ActionForm action={createStaff} className="space-y-3"><div className="form-grid">
        <div><label className="label" htmlFor="role">Role</label><select id="role" name="role" className="input">{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label className="label" htmlFor="full_name">Full name</label><input id="full_name" name="full_name" required className="input" /></div>
        <div><label className="label" htmlFor="staff_id">Staff / Institutional ID</label><input id="staff_id" name="staff_id" required className="input" /></div>
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" /></div>
        <div><label className="label" htmlFor="phone">Mobile</label><input id="phone" name="phone" type="tel" className="input" /></div>
        <div><label className="label" htmlFor="department_id">Department</label><select id="department_id" name="department_id" className="input"><option value="">None</option>{((d.data ?? []) as { id: string; name: string }[]).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="is_hod" className="size-5" /> Head of Department</label>
      </div>
      <fieldset><legend className="label">Tiers handled (Office Staff)</legend><div className="flex flex-wrap gap-3">{TIERS.map((t) => <label key={t} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="tiers" value={t} className="size-5" /> {TIER_LABEL[t]}</label>)}</div></fieldset>
      <Submit>Create account</Submit></ActionForm></section>
    <section className="card"><h2 className="section-title">Reset someone's password</h2>
      <p className="mb-3 text-sm text-[var(--ink-soft)]">Check the person's identity first. Works for students, parents and staff.</p>
      <ActionForm action={resetPassword} className="form-grid"><div><label className="label" htmlFor="identifier">Their login</label><input id="identifier" name="identifier" required autoComplete="off" className="input" /></div><Submit className="btn btn-secondary">Reset password</Submit></ActionForm></section>
    <section className="card overflow-x-auto"><table className="data-table"><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Status</th><th></th></tr></thead>
      <tbody>{((data ?? []) as Person[]).map((p) => <tr key={p.id}><td>{p.full_name}{p.is_hod && <span className="badge ml-1">HOD</span>}</td><td className="capitalize">{p.role.replace("_", " ")}</td><td>{p.email}</td><td>{p.is_active ? "Active" : "Inactive"}</td>
        <td><ActionForm action={setActive}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="active" value={String(!p.is_active)} /><Submit className="btn btn-secondary">{p.is_active ? "Deactivate" : "Reactivate"}</Submit></ActionForm></td></tr>)}</tbody></table></section>
  </div>;
}
