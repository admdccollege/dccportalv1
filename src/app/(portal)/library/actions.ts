"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { friendlyError, type ActionState } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";

const STAFF = ["super_admin", "management", "principal", "office_staff"] as const;

export async function addBook(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole(STAFF);
    const parsed = z.object({
      title: z.string().trim().min(1, "Add a title."), author: z.string().trim().optional(), isbn: z.string().trim().optional(),
      accession_no: z.string().trim().min(1, "Add an accession number."), barcode: z.string().trim().optional(),
    }).safeParse(Object.fromEntries(form));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const d = parsed.data;
    const supabase = await createClient();
    const { data: book, error } = await supabase.from("library_books").insert({ title: d.title, author: d.author || null, isbn: d.isbn || null }).select("id").single();
    if (error) throw error;
    const { error: copyError } = await supabase.from("library_copies").insert({ book_id: book.id, accession_no: d.accession_no, barcode: d.barcode || null });
    if (copyError) { await supabase.from("library_books").delete().eq("id", book.id); throw copyError; }
    revalidatePath("/library");
    return { ok: "Book added to the register." };
  } catch (e) { return { error: friendlyError(e) }; }
}

export async function issue(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole(STAFF);
    const code = String(form.get("code") ?? "").trim();
    const enrollment = String(form.get("enrollment_no") ?? "").trim();
    if (!code || !enrollment) return { error: "Scan the book and enter the enrollment number." };
    const supabase = await createClient();
    const { data: s } = await supabase.from("students").select("id, full_name").eq("enrollment_no", enrollment).maybeSingle();
    if (!s) return { error: "No student matches this enrollment number." };
    const { data, error } = await supabase.rpc("issue_book", { p_code: code, p_student: s.id });
    if (error) throw error;
    revalidatePath("/library");
    return { ok: `Issued to ${s.full_name}. Due on ${data.due_on}.` };
  } catch (e) { return { error: friendlyError(e) }; }
}

export async function returnBook(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole(STAFF);
    const code = String(form.get("code") ?? "").trim();
    if (!code) return { error: "Scan the book first." };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("return_book", { p_code: code });
    if (error) throw error;
    revalidatePath("/library");
    return { ok: Number(data.fine_amount) > 0 ? `Returned. A fine of ₹${data.fine_amount} was added to the student's fee ledger.` : "Returned on time." };
  } catch (e) { return { error: friendlyError(e) }; }
}
