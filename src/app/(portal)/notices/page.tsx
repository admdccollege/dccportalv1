import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Submit } from "@/components/action-form";
import { RichText } from "@/components/rich-text";
import { deleteNotice, publishNotice } from "./actions";

export const metadata: Metadata = { title: "Notices" };
const AUDIENCE: Record<string, string> = { campus: "Campus-wide", higher_secondary: "Higher Secondary Only", undergraduate: "Degree College Only", postgraduate: "PG Department Only", faculty: "Faculty Only", parents: "Parents Only" };
const PRIORITY: Record<string, string> = { urgent: "Urgent", academic: "Academic", exam: "Exam Notice", holiday: "Holiday", institutional: "Institutional" };
type Notice = { id: string; title: string; body_html: string; audience: string; priority: string; published_at: string; notice_attachments: { id: string; file_name: string; storage_path: string }[] };

export default async function NoticesPage() {
  const profile = await requireRole();
  const supabase = await createClient();
  const canPost = ["super_admin", "management", "principal", "exam_cell"].includes(profile.role);
  const { data } = await supabase.from("notices").select("id, title, body_html, audience, priority, published_at, notice_attachments(id, file_name, storage_path)").order("published_at", { ascending: false }).limit(50);
  const notices = await Promise.all(((data ?? []) as Notice[]).map(async (n) => ({
    ...n,
    files: await Promise.all(n.notice_attachments.map(async (a) => ({ ...a, url: (await supabase.storage.from("notice-attachments").createSignedUrl(a.storage_path, 3600)).data?.signedUrl }))),
  })));
  return <div className="space-y-4">
    <h1 className="page-title mb-0">Notices & circulars</h1>
    {canPost && <section className="card"><h2 className="section-title">New notice</h2>
      <ActionForm action={publishNotice} className="space-y-3">
        <div className="form-grid">
          <div><label className="label" htmlFor="title">Title</label><input id="title" name="title" required className="input" /></div>
          <div><label className="label" htmlFor="audience">Audience</label><select id="audience" name="audience" className="input">{Object.entries(AUDIENCE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className="label" htmlFor="priority">Priority</label><select id="priority" name="priority" defaultValue="institutional" className="input">{Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className="label" htmlFor="expires_at">Hide after (optional)</label><input id="expires_at" name="expires_at" type="datetime-local" className="input" /></div>
        </div>
        <div><span className="label" id="body-label">Notice text</span><RichText name="body_html" id="body" /></div>
        <div><label className="label" htmlFor="files">Attachments (PDF or images, up to 10 MB each)</label><input id="files" name="files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="input" /></div>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="push" className="size-5" /> Send a push alert</label>
        <Submit>Publish notice</Submit>
      </ActionForm></section>}
    {notices.map((n) => <article key={n.id} className="card">
      <div className="mb-1 flex flex-wrap gap-1"><span className={`badge ${n.priority === "urgent" ? "bg-[var(--bad-bg)] text-[var(--bad)]" : ""}`}>{PRIORITY[n.priority]}</span><span className="badge">{AUDIENCE[n.audience]}</span></div>
      <h2 className="font-semibold">{n.title}</h2>
      <p className="mb-2 text-xs text-[var(--ink-soft)]">{new Date(n.published_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
      {/* Sanitized on the server before it is stored. */}
      <div className="notice-body text-sm" dangerouslySetInnerHTML={{ __html: n.body_html }} />
      {n.files.length > 0 && <ul className="mt-2 text-sm">{n.files.map((f) => <li key={f.id}>{f.url ? <a className="text-[var(--brand)] underline" href={f.url} target="_blank" rel="noreferrer">{f.file_name}</a> : f.file_name}</li>)}</ul>}
      {canPost && <ActionForm action={deleteNotice} className="mt-2"><input type="hidden" name="id" value={n.id} /><Submit className="btn btn-danger">Remove</Submit></ActionForm>}
    </article>)}
    {!notices.length && <p className="card">No notices right now.</p>}
  </div>;
}
