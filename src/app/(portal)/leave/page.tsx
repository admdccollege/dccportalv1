import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Submit } from "@/components/action-form";
import { decideLeave, requestLeave } from "./actions";

export const metadata: Metadata = { title: "Leave" };
const STATUS: Record<string, string> = { pending: "Waiting for HOD", hod_approved: "Waiting for Principal", approved: "Approved", rejected: "Rejected" };
type Leave = { id: string; faculty_id: string; leave_type: string; from_date: string; to_date: string; reason: string; status: string; requester: { full_name: string }; substitute: { full_name: string } | null };

export default async function LeavePage() {
  const profile = await requireRole(["super_admin", "management", "principal", "exam_cell", "faculty", "office_staff", "lab_technician"]);
  const supabase = await createClient();
  const isAdmin = ["super_admin", "management", "principal"].includes(profile.role);
  const [{ data }, colleagues] = await Promise.all([
    supabase.from("faculty_leaves").select("id, faculty_id, leave_type, from_date, to_date, reason, status, requester:profiles!faculty_leaves_faculty_id_fkey(full_name), substitute:profiles!faculty_leaves_substitute_id_fkey(full_name)").order("created_at", { ascending: false }).limit(100),
    supabase.from("profiles").select("id, full_name").eq("role", "faculty").eq("is_active", true).neq("id", profile.id).order("full_name"),
  ]);
  const rows = (data ?? []) as unknown as Leave[];
  const canDecide = (l: Leave) => l.faculty_id !== profile.id && ((isAdmin && ["pending", "hod_approved"].includes(l.status)) || (profile.is_hod && l.status === "pending"));
  return <div className="space-y-4">
    <h1 className="page-title mb-0">Leave</h1>
    <section className="card"><h2 className="section-title">Request leave</h2>
      <ActionForm action={requestLeave} className="form-grid">
        <div><label className="label" htmlFor="leave_type">Type</label><select id="leave_type" name="leave_type" className="input"><option value="casual">Casual leave</option><option value="duty">Duty leave</option></select></div>
        <div><label className="label" htmlFor="from_date">From</label><input id="from_date" name="from_date" type="date" required className="input" /></div>
        <div><label className="label" htmlFor="to_date">To</label><input id="to_date" name="to_date" type="date" required className="input" /></div>
        <div><label className="label" htmlFor="substitute_id">Substitute</label><select id="substitute_id" name="substitute_id" className="input"><option value="">None</option>{((colleagues.data ?? []) as { id: string; full_name: string }[]).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></div>
        <div><label className="label" htmlFor="reason">Reason</label><input id="reason" name="reason" required className="input" /></div>
        <Submit>Send request</Submit>
      </ActionForm></section>
    <section className="card overflow-x-auto"><h2 className="section-title">Requests</h2><table className="data-table">
      <thead><tr><th>Staff</th><th>Dates</th><th>Type</th><th>Reason</th><th>Substitute</th><th>Status</th><th></th></tr></thead>
      <tbody>{rows.map((l) => <tr key={l.id}><td>{l.requester.full_name}</td><td>{l.from_date} to {l.to_date}</td><td className="capitalize">{l.leave_type}</td><td>{l.reason}</td><td>{l.substitute?.full_name ?? ""}</td><td>{STATUS[l.status]}</td>
        <td>{canDecide(l) && <div className="flex gap-1">
          <ActionForm action={decideLeave}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="decision" value="approve" /><Submit className="btn btn-secondary">Approve</Submit></ActionForm>
          <ActionForm action={decideLeave}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="decision" value="reject" /><Submit className="btn btn-danger">Reject</Submit></ActionForm>
        </div>}</td></tr>)}
        {!rows.length && <tr><td colSpan={7}>No leave requests.</td></tr>}</tbody></table></section>
  </div>;
}
