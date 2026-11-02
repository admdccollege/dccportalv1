import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "@/lib/push";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return !!secret && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

type AlertRow = { id: string; percent: number; students: { full_name: string; user_id: string | null; student_guardians: { guardians: { user_id: string | null } }[] } };
type DueRow = { student_id: string; description: string; students: { user_id: string | null; student_guardians: { guardians: { user_id: string | null } }[] } };
const familyIds = (s: { user_id: string | null; student_guardians: { guardians: { user_id: string | null } }[] }) =>
  [s.user_id, ...s.student_guardians.map((g) => g.guardians.user_id)].filter(Boolean) as string[];

/** Sends new low-attendance alerts, and reminders for fees due in three days. */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: alerts } = await admin.from("attendance_alerts")
    .select("id, percent, students(full_name, user_id, student_guardians(guardians(user_id)))")
    .is("resolved_at", null).is("push_sent_at", null).limit(500);
  let attendanceAlerts = 0;
  for (const a of (alerts ?? []) as unknown as AlertRow[]) {
    await sendPush(familyIds(a.students), { title: "Low attendance", body: `${a.students.full_name} is at ${a.percent}% in a subject.`, url: "/dashboard", tag: `attendance-${a.id}` });
    await admin.from("attendance_alerts").update({ push_sent_at: new Date().toISOString() }).eq("id", a.id);
    attendanceAlerts++;
  }
  const target = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const { data: dues } = await admin.from("ledger_entries")
    .select("student_id, description, students(user_id, student_guardians(guardians(user_id)))")
    .eq("entry_type", "charge").eq("due_on", target).limit(5000);
  const rows = (dues ?? []) as unknown as DueRow[];
  const students = [...new Set(rows.map((d) => d.student_id))];
  const { data: balances } = students.length ? await admin.from("student_fee_balance").select("student_id, outstanding").in("student_id", students).gt("outstanding", 0) : { data: [] };
  let feeReminders = 0;
  for (const { student_id } of (balances ?? []) as { student_id: string }[]) {
    const row = rows.find((d) => d.student_id === student_id)!;
    await sendPush(familyIds(row.students), { title: "Fee due soon", body: `Fees are due on ${target}.`, url: "/fees", tag: `fees-${target}` });
    feeReminders++;
  }
  return NextResponse.json({ attendanceAlerts, feeReminders });
}
