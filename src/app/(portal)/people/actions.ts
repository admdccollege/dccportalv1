"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { friendlyError, type ActionState } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAccount, temporaryPassword } from "@/lib/provision";
import { TIERS } from "@/lib/roles";

const ADMIN = ["super_admin", "management", "principal"] as const;
const schema = z.object({
  role: z.enum(["management", "principal", "exam_cell", "faculty", "office_staff", "lab_technician", "super_admin"]),
  full_name: z.string().trim().min(1, "Enter a name.").max(150), staff_id: z.string().trim().min(1, "Enter a Staff or Institutional ID.").max(60),
  email: z.string().trim().email("Enter a valid email.").or(z.literal("")), phone: z.string().trim().max(20).optional(),
  department_id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  is_hod: z.string().optional().transform((v) => v === "on"),
});

export async function createStaff(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const me = await assertRole(ADMIN);
    const parsed = schema.safeParse(Object.fromEntries([...form.entries()].filter(([k]) => k !== "tiers")));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const d = parsed.data;
    if (d.role === "super_admin" && me.role !== "super_admin") return { error: "Only a Super Admin can create another Super Admin." };
    const tiers = form.getAll("tiers").map(String).filter((t) => (TIERS as readonly string[]).includes(t)) as (typeof TIERS)[number][];
    const { password } = await createAccount({
      role: d.role, fullName: d.full_name, email: d.email || null, phone: d.phone || null,
      identifiers: [d.staff_id, d.email], departmentId: d.department_id, isHod: d.is_hod, tiers,
    });
    revalidatePath("/people");
    return { ok: `Account created. Login: ${d.staff_id}. Temporary password: ${password} (shown only once).` };
  } catch (e) { return { error: friendlyError(e) }; }
}

export async function setActive(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const me = await assertRole(ADMIN);
    const id = z.string().uuid().parse(form.get("id"));
    if (id === me.id) return { error: "You can't deactivate your own account." };
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update({ is_active: form.get("active") === "true" }).eq("id", id);
    if (error) throw error;
    revalidatePath("/people");
    return { ok: "Updated." };
  } catch (e) { return { error: friendlyError(e) }; }
}

/** The office route for people with no email on file, after checking who they are. */
export async function resetPassword(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const me = await assertRole(ADMIN);
    const identifier = String(form.get("identifier") ?? "").trim().toLowerCase();
    if (!identifier) return { error: "Enter the person's login." };
    const admin = createAdminClient();
    const { data: found } = await admin.from("login_identifiers").select("user_id, profiles(role)").eq("identifier", identifier).limit(2);
    const rows = (found ?? []) as unknown as { user_id: string; profiles: { role: string } }[];
    if (rows.length !== 1) return { error: rows.length ? "This login matches more than one account." : "No account matches this login." };
    if (rows[0].profiles.role === "super_admin" && me.role !== "super_admin") return { error: "Only a Super Admin can reset this account." };
    const password = temporaryPassword();
    const { error } = await admin.auth.admin.updateUserById(rows[0].user_id, { password });
    if (error) throw error;
    await admin.from("profiles").update({ must_change_password: true }).eq("id", rows[0].user_id);
    return { ok: `New temporary password: ${password} (shown only once).` };
  } catch (e) { return { error: friendlyError(e) }; }
}
