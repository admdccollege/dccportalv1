"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { friendlyError, type ActionState } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";

const STAFF = ["super_admin", "management", "principal", "exam_cell", "faculty", "office_staff", "lab_technician"] as const;
const schema = z.object({
  leave_type: z.enum(["casual", "duty"]), from_date: z.string().min(1, "Choose the start date."), to_date: z.string().min(1, "Choose the end date."),
  reason: z.string().trim().min(1, "Add a reason.").max(500),
  substitute_id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
}).refine((v) => v.to_date >= v.from_date, "The end date can't be before the start date.");

export async function requestLeave(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const profile = await assertRole(STAFF);
    const parsed = schema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const supabase = await createClient();
    const { error } = await supabase.from("faculty_leaves").insert({ ...parsed.data, faculty_id: profile.id });
    if (error) throw error;
    revalidatePath("/leave");
    return { ok: "Leave request sent." };
  } catch (e) { return { error: friendlyError(e) }; }
}

export async function decideLeave(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole(STAFF);
    const supabase = await createClient();
    const approve = form.get("decision") === "approve";
    const { error } = await supabase.rpc("decide_leave", { p_leave: String(form.get("id")), p_approve: approve, p_note: null });
    if (error) throw error;
    revalidatePath("/leave");
    return { ok: approve ? "Approved." : "Rejected." };
  } catch (e) { return { error: friendlyError(e) }; }
}
