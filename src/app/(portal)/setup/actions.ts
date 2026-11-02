"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { friendlyError, type ActionState } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { TIERS } from "@/lib/roles";

const ADMIN = ["super_admin", "management", "principal"] as const;
const tier = z.enum(TIERS);
const nullable = z.string().uuid().optional().or(z.literal("")).transform((v) => v || null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const text = (n: string) => z.string().trim().min(1, `${n} is required.`).max(200);

const SCHEMAS = {
  departments: z.object({ code: text("Code").transform((v) => v.toUpperCase()), name: text("Name") }),
  academic_years: z.object({ label: text("Label"), starts_on: date, ends_on: date, is_current: z.string().optional().transform((v) => v === "on") }),
  programs: z.object({ tier, code: text("Code"), name: text("Name"), department_id: nullable, total_terms: z.coerce.number().int().min(1).max(12) }),
  terms: z.object({ academic_year_id: z.string().uuid(), tier, term_no: z.coerce.number().int().min(1).max(12), label: text("Label"), starts_on: date, ends_on: date }),
  courses: z.object({ tier, code: text("Code"), title: text("Title"), program_id: nullable, department_id: nullable,
    category: z.enum(["core", "major", "minor", "skill_enhancement", "value_added", "lab_practical", "elective", "specialization", "seminar", "thesis", "class_group"]),
    credits: z.coerce.number().min(0).max(40) }),
} as const;
export type SetupTable = keyof typeof SCHEMAS;

export async function addRow(table: SetupTable, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole(ADMIN);
    const parsed = SCHEMAS[table].safeParse(Object.fromEntries(form));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const supabase = await createClient();
    const row = parsed.data as Record<string, unknown>;
    if (table === "academic_years" && row.is_current) {
      const { error } = await supabase.from("academic_years").update({ is_current: false }).eq("is_current", true);
      if (error) throw error;
    }
    const { error } = await supabase.from(table).insert(row);
    if (error) throw error;
    revalidatePath("/setup");
    return { ok: "Saved." };
  } catch (e) { return { error: friendlyError(e) }; }
}

export async function addSection(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole(ADMIN);
    const parsed = z.object({ course_id: z.string().uuid(), term_id: z.string().uuid(), name: text("Section name"), faculty_id: nullable }).safeParse(Object.fromEntries(form));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const supabase = await createClient();
    const { data: course } = await supabase.from("courses").select("tier").eq("id", parsed.data.course_id).single();
    const { data: term } = await supabase.from("terms").select("tier").eq("id", parsed.data.term_id).single();
    if (course?.tier !== term?.tier) return { error: "The course and term belong to different tiers." };
    const { data: section, error } = await supabase.from("sections").insert({
      course_id: parsed.data.course_id, term_id: parsed.data.term_id, name: parsed.data.name, tier: course!.tier,
    }).select("id").single();
    if (error) throw error;
    if (parsed.data.faculty_id) {
      const a = await supabase.from("faculty_assignments").insert({ faculty_id: parsed.data.faculty_id, section_id: section.id });
      if (a.error) throw a.error;
    }
    revalidatePath("/setup");
    return { ok: "Class section created." };
  } catch (e) { return { error: friendlyError(e) }; }
}

export async function assignFaculty(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole(ADMIN);
    const parsed = z.object({ faculty_id: z.string().uuid(), section_id: z.string().uuid() }).safeParse(Object.fromEntries(form));
    if (!parsed.success) return { error: "Choose a faculty member and a class." };
    const supabase = await createClient();
    const { error } = await supabase.from("faculty_assignments").upsert(parsed.data);
    if (error) throw error;
    return { ok: "Faculty assigned." };
  } catch (e) { return { error: friendlyError(e) }; }
}

/** Enrols students by pasted enrollment numbers, reporting any that fail. */
export async function enrollStudents(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole(ADMIN);
    const section = z.string().uuid().parse(form.get("section_id"));
    const numbers = [...new Set(String(form.get("enrollment_nos") ?? "").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];
    if (!numbers.length) return { error: "Enter at least one enrollment number." };
    const supabase = await createClient();
    const { data: sec } = await supabase.from("sections").select("tier").eq("id", section).single();
    const { data } = await supabase.from("students").select("id, enrollment_no, tier").in("enrollment_no", numbers);
    const found = (data ?? []) as { id: string; enrollment_no: string; tier: string }[];
    const matching = found.filter((s) => s.tier === sec?.tier);
    const unknown = numbers.filter((n) => !found.some((s) => s.enrollment_no === n));
    const wrongTier = found.filter((s) => s.tier !== sec?.tier).map((s) => s.enrollment_no);
    if (matching.length) {
      const { error } = await supabase.from("enrollments").upsert(
        matching.map((s) => ({ student_id: s.id, section_id: section })), { onConflict: "student_id,course_id,term_id", ignoreDuplicates: true },
      );
      if (error) throw error;
    }
    const notes = [unknown.length && `Not found: ${unknown.join(", ")}.`, wrongTier.length && `Different tier: ${wrongTier.join(", ")}.`].filter(Boolean).join(" ");
    return matching.length ? { ok: `${matching.length} students enrolled. ${notes}`.trim() } : { error: notes || "No students matched." };
  } catch (e) { return { error: friendlyError(e) }; }
}
