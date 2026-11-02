"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { friendlyError, type ActionState } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";

export async function publishTerm(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole(["super_admin", "management", "principal", "exam_cell"]);
    const term = z.string().uuid().parse(form.get("term_id"));
    const supabase = await createClient();
    const { data } = await supabase.from("enrollments").select("student_id").eq("term_id", term);
    const ids = [...new Set(((data ?? []) as { student_id: string }[]).map((r) => r.student_id))];
    if (!ids.length) return { error: "No students are enrolled in this term." };
    let done = 0; const skipped: string[] = [];
    for (const id of ids) {
      const { error } = await supabase.rpc("publish_term_result", { p_student: id, p_term: term });
      if (error) skipped.push(error.message); else done++;
    }
    revalidatePath("/results");
    return { ok: `Published ${done} of ${ids.length} results.${skipped.length ? ` Skipped ${skipped.length}: ${skipped[0]}` : ""}` };
  } catch (e) { return { error: friendlyError(e) }; }
}
