"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { friendlyError, type ActionState } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";

const ADMIN = ["super_admin", "management", "principal"] as const;
const COLLECT = [...ADMIN, "office_staff"] as const;
const amount = z.coerce.number().positive("Enter an amount above 0.").max(10000000);

export async function recordPayment(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole(COLLECT);
    const parsed = z.object({
      student_id: z.string().uuid(), amount, mode: z.enum(["cash", "upi", "bank_transfer"]),
      reference: z.string().trim().max(100).optional(), paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the payment date."),
    }).refine((v) => v.mode === "cash" || !!v.reference, "A transaction reference is required for UPI and bank transfers.").safeParse(Object.fromEntries(form));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const d = parsed.data;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_payment", { p_student: d.student_id, p_amount: d.amount, p_mode: d.mode, p_reference: d.reference ?? null, p_paid_on: d.paid_on });
    if (error) throw error;
    revalidatePath(`/fees/${d.student_id}`);
    return { ok: `Receipt ${data.receipt_no} issued.` };
  } catch (e) { return { error: friendlyError(e) }; }
}

export async function addConcession(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const profile = await assertRole(ADMIN);
    const parsed = z.object({
      student_id: z.string().uuid(), entry_type: z.enum(["concession", "scholarship"]), amount,
      description: z.string().trim().min(1, "Add a description.").max(200),
    }).safeParse(Object.fromEntries(form));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const supabase = await createClient();
    const { error } = await supabase.from("ledger_entries").insert({ ...parsed.data, created_by: profile.id });
    if (error) throw error;
    revalidatePath(`/fees/${parsed.data.student_id}`);
    return { ok: "Added to the ledger." };
  } catch (e) { return { error: friendlyError(e) }; }
}

export async function voidPayment(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole(ADMIN);
    const supabase = await createClient();
    const { error } = await supabase.rpc("void_payment", { p_payment: String(form.get("payment_id")), p_reason: String(form.get("reason") ?? "") });
    if (error) throw error;
    revalidatePath(`/fees/${String(form.get("student_id"))}`);
    return { ok: "Payment voided and the balance restored." };
  } catch (e) { return { error: friendlyError(e) }; }
}

export async function createStructure(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole(ADMIN);
    const parsed = z.object({
      tier: z.enum(["higher_secondary", "undergraduate", "postgraduate"]), academic_year_id: z.string().uuid(),
      program_id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
      period_no: z.coerce.number().int().min(1).max(12), label: z.string().trim().min(1, "Add a label."),
      due_on: z.string().optional().transform((v) => v || null),
    }).safeParse(Object.fromEntries(form));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const items = [...form.entries()].filter(([k, v]) => k.startsWith("head:") && Number(v) > 0).map(([k, v]) => ({ head_id: k.slice(5), amount: Number(v) }));
    if (!items.length) return { error: "Enter an amount for at least one fee head." };
    const supabase = await createClient();
    const { data, error } = await supabase.from("fee_structures").insert(parsed.data).select("id").single();
    if (error) throw error;
    const { error: itemError } = await supabase.from("fee_structure_items").insert(items.map((i) => ({ ...i, structure_id: data.id })));
    if (itemError) { await supabase.from("fee_structures").delete().eq("id", data.id); throw itemError; }
    revalidatePath("/fees/structures");
    return { ok: "Fee structure created." };
  } catch (e) { return { error: friendlyError(e) }; }
}

export async function assignStructure(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole(ADMIN);
    const id = z.string().uuid().parse(form.get("structure_id"));
    const supabase = await createClient();
    const { data: fs } = await supabase.from("fee_structures").select("tier, program_id").eq("id", id).single();
    let query = supabase.from("students").select("id").eq("status", "active").eq("tier", fs!.tier);
    if (fs!.program_id) query = query.eq("program_id", fs!.program_id);
    const { data: students } = await query;
    const ids = ((students ?? []) as { id: string }[]).map((s) => s.id);
    if (!ids.length) return { error: "No active students match this fee structure." };
    const { data, error } = await supabase.rpc("assign_fee_structure", { p_structure: id, p_students: ids });
    if (error) throw error;
    return { ok: `${data} new charges posted across ${ids.length} students. Students already charged were left alone.` };
  } catch (e) { return { error: friendlyError(e) }; }
}
