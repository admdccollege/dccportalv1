"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { friendlyError, type ActionState } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";

const STAFF = ["super_admin", "management", "principal", "exam_cell", "faculty", "lab_technician"] as const;
const KINDS = ["unit_test", "midterm", "pre_board", "practical_record", "cia_1", "cia_2", "assignment", "seminar", "lab_practical", "semester_end", "thesis"] as const;

const assessment = z.object({
  section_id: z.string().uuid(), name: z.string().trim().min(1, "Enter a name.").max(80), kind: z.enum(KINDS),
  max_marks: z.coerce.number().positive("Maximum marks must be above 0.").max(1000),
  weightage: z.coerce.number().positive("Weightage must be above 0.").max(100),
  exam_date: z.string().optional().transform((v) => v || null),
});

export async function createAssessment(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const profile = await assertRole(STAFF);
    const parsed = assessment.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const supabase = await createClient();
    const { error } = await supabase.from("assessments").insert({ ...parsed.data, created_by: profile.id });
    if (error) throw error;
    revalidatePath("/marks");
    return { ok: "Assessment added." };
  } catch (e) { return { error: friendlyError(e) }; }
}

const entries = z.array(z.object({
  assessment_id: z.string().uuid(), student_id: z.string().uuid(),
  marks: z.number().min(0).nullable(), is_absent: z.boolean(),
})).max(20000);

export async function saveMarks(input: z.input<typeof entries>): Promise<{ error?: string; saved?: number }> {
  try {
    await assertRole(STAFF);
    const rows = entries.parse(input);
    const supabase = await createClient();
    const toDelete = rows.filter((r) => r.marks === null && !r.is_absent);
    const toSave = rows.filter((r) => r.marks !== null || r.is_absent).map((r) => ({ ...r, marks: r.is_absent ? null : r.marks }));
    if (toSave.length) {
      const { error } = await supabase.from("marks").upsert(toSave);
      if (error) throw error;
    }
    for (const r of toDelete) {
      const { error } = await supabase.from("marks").delete().eq("assessment_id", r.assessment_id).eq("student_id", r.student_id);
      if (error) throw error;
    }
    revalidatePath("/marks");
    return { saved: rows.length };
  } catch (e) { return { error: friendlyError(e) }; }
}

export async function setPublished(assessmentId: string, published: boolean): Promise<{ error?: string }> {
  try {
    await assertRole(STAFF);
    const supabase = await createClient();
    const { error } = await supabase.from("assessments").update({ is_published: published }).eq("id", z.string().uuid().parse(assessmentId));
    if (error) throw error;
    revalidatePath("/marks");
    return {};
  } catch (e) { return { error: friendlyError(e) }; }
}
