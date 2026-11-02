"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { friendlyError, type ActionState } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";

const toMinutes = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const schema = z.object({
  academic_year_id: z.string().uuid(), section_id: z.string().uuid(), faculty_id: z.string().uuid(),
  weekday: z.coerce.number().int().min(1).max(7), start: z.string().regex(/^\d\d:\d\d$/), end: z.string().regex(/^\d\d:\d\d$/),
  room: z.string().trim().max(40).optional().transform((v) => v || null),
}).refine((v) => toMinutes(v.end) > toMinutes(v.start), "The end time must be after the start time.");

export async function addSlot(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole(["super_admin", "management", "principal"]);
    const parsed = schema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const { start, end, ...rest } = parsed.data;
    const supabase = await createClient();
    const { error } = await supabase.from("timetable_slots").insert({ ...rest, start_minute: toMinutes(start), end_minute: toMinutes(end) });
    if (error) throw error;
    revalidatePath("/timetable");
    return { ok: "Added to the timetable." };
  } catch (e) { return { error: friendlyError(e) }; }
}

export async function removeSlot(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole(["super_admin", "management", "principal"]);
    const supabase = await createClient();
    const { error } = await supabase.from("timetable_slots").delete().eq("id", z.string().uuid().parse(form.get("id")));
    if (error) throw error;
    revalidatePath("/timetable");
    return { ok: "Removed." };
  } catch (e) { return { error: friendlyError(e) }; }
}
