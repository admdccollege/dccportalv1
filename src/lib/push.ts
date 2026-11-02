import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushPayload = { title: string; body: string; url?: string; tag?: string };
export const pushConfigured = () => !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);

/** Sends to each user's devices and removes subscriptions the browser has retired. */
export async function sendPush(userIds: string[], payload: PushPayload): Promise<number> {
  if (!pushConfigured() || userIds.length === 0) return 0;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const admin = createAdminClient();
  let sent = 0;
  for (let i = 0; i < userIds.length; i += 200) {
    const { data } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").in("user_id", userIds.slice(i, i + 200));
    const subs: { endpoint: string; p256dh: string; auth: string }[] = data ?? [];
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }));
  }
  return sent;
}

/** Everyone a notice's audience covers. */
export async function audienceUserIds(audience: string): Promise<string[]> {
  const admin = createAdminClient();
  const ids = async (query: PromiseLike<{ data: unknown }>, pick: (r: never) => string | null | undefined) =>
    (((await query).data ?? []) as never[]).map(pick).filter(Boolean) as string[];
  if (audience === "campus") return ids(admin.from("profiles").select("id").eq("is_active", true), (r: { id: string }) => r.id);
  if (audience === "faculty") return ids(admin.from("profiles").select("id").in("role", ["faculty", "office_staff", "lab_technician", "exam_cell", "principal", "management", "super_admin"]).eq("is_active", true), (r: { id: string }) => r.id);
  if (audience === "parents") return ids(admin.from("profiles").select("id").eq("role", "parent").eq("is_active", true), (r: { id: string }) => r.id);
  const studentIds = await ids(admin.from("students").select("user_id").eq("tier", audience).eq("status", "active"), (r: { user_id: string | null }) => r.user_id);
  const parentIds = await ids(
    admin.from("student_guardians").select("guardians!inner(user_id), students!inner(tier)").eq("students.tier", audience),
    (r: { guardians: { user_id: string | null } }) => r.guardians?.user_id,
  );
  const facultyIds = await ids(
    admin.from("faculty_assignments").select("faculty_id, sections!inner(tier)").eq("sections.tier", audience),
    (r: { faculty_id: string }) => r.faculty_id,
  );
  return [...new Set([...studentIds, ...parentIds, ...facultyIds])];
}
