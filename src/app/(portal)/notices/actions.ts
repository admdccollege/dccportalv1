"use server";
import { revalidatePath } from "next/cache";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { friendlyError, type ActionState } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { audienceUserIds, sendPush } from "@/lib/push";

const schema = z.object({
  title: z.string().trim().min(1, "Add a title.").max(200), body_html: z.string().min(1, "Write the notice."),
  audience: z.enum(["campus", "higher_secondary", "undergraduate", "postgraduate", "faculty", "parents"]),
  priority: z.enum(["urgent", "academic", "exam", "holiday", "institutional"]),
  expires_at: z.string().optional().transform((v) => (v ? new Date(v).toISOString() : null)),
});
const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export async function publishNotice(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const profile = await assertRole(["super_admin", "management", "principal", "exam_cell"]);
    const parsed = schema.safeParse(Object.fromEntries([...form.entries()].filter(([k]) => k !== "files")));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const clean = sanitizeHtml(parsed.data.body_html, {
      allowedTags: ["p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "h3", "a", "div"],
      allowedAttributes: { a: ["href", "rel", "target"] }, allowedSchemes: ["http", "https", "mailto"],
      transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }) },
    });
    if (!sanitizeHtml(clean, { allowedTags: [] }).trim()) return { error: "Write the notice." };
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) return { error: `${f.name} is larger than 10 MB.` };
      if (!FILE_TYPES.includes(f.type)) return { error: `${f.name} must be a PDF or image.` };
    }
    const supabase = await createClient();
    const { data: notice, error } = await supabase.from("notices")
      .insert({ ...parsed.data, body_html: clean, created_by: profile.id }).select("id").single();
    if (error) throw error;
    for (const f of files) {
      const path = `${notice.id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]+/g, "_").slice(-80)}`;
      const up = await supabase.storage.from("notice-attachments").upload(path, f, { contentType: f.type });
      if (up.error) throw up.error;
      const att = await supabase.from("notice_attachments").insert({ notice_id: notice.id, storage_path: path, file_name: f.name, content_type: f.type });
      if (att.error) throw att.error;
    }
    let pushed = 0;
    if (form.get("push") === "on") {
      pushed = await sendPush(await audienceUserIds(parsed.data.audience), {
        title: parsed.data.priority === "urgent" ? `Urgent: ${parsed.data.title}` : parsed.data.title,
        body: sanitizeHtml(clean, { allowedTags: [] }).slice(0, 140), url: "/notices", tag: notice.id,
      });
      await supabase.from("notices").update({ push_sent_at: new Date().toISOString() }).eq("id", notice.id);
    }
    revalidatePath("/notices");
    return { ok: `Notice published${form.get("push") === "on" ? `. Alert sent to ${pushed} devices.` : "."}` };
  } catch (e) { return { error: friendlyError(e) }; }
}

export async function deleteNotice(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole(["super_admin", "management", "principal", "exam_cell"]);
    const supabase = await createClient();
    const id = z.string().uuid().parse(form.get("id"));
    const { data: files } = await supabase.from("notice_attachments").select("storage_path").eq("notice_id", id);
    const paths = ((files ?? []) as { storage_path: string }[]).map((f) => f.storage_path);
    const { error } = await supabase.from("notices").delete().eq("id", id);
    if (error) throw error;
    if (paths.length) await supabase.storage.from("notice-attachments").remove(paths);
    revalidatePath("/notices");
    return { ok: "Notice removed." };
  } catch (e) { return { error: friendlyError(e) }; }
}
