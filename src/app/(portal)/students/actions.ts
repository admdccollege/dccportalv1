"use server";
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { assertRole, type Profile } from "@/lib/auth";
import { friendlyError, type ActionState } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAccount } from "@/lib/provision";
import { parseImportRow, studentSchema, type StudentInput } from "@/lib/schemas";

const CAN_ONBOARD = ["super_admin", "management", "principal", "office_staff"] as const;
const MAX_ROWS = 2000;
const MAX_BYTES = 10 * 1024 * 1024;
export type Credential = { name: string; portal: "student" | "parent"; login: string; password: string };

function assertTierAllowed(profile: Profile, tier: string) {
  if (profile.role === "office_staff" && !profile.tiers.includes(tier as Profile["tiers"][number])) {
    throw new Error("You are not assigned to this academic tier.");
  }
}

/** Creates the student, their login, and a linked guardian login. */
async function onboard(input: StudentInput): Promise<Credential[]> {
  const admin = createAdminClient();
  const credentials: Credential[] = [];
  const { guardian_name, guardian_relation, guardian_phone, guardian_email, ...rest } = input;
  const record: Record<string, unknown> = { ...rest };
  if (input.tier === "postgraduate") {
    const { data: dept } = await admin.from("departments").select("id").eq("code", input.department_code).maybeSingle();
    if (!dept) throw new Error(`Unknown department code "${input.department_code}".`);
    delete record.department_code;
    record.department_id = dept.id;
  }
  const student = await createAccount({
    role: "student", fullName: input.full_name, email: input.email, phone: input.phone, identifiers: [input.enrollment_no],
  });
  record.user_id = student.userId;
  const { data: created, error } = await admin.from("students").insert(record).select("id").single();
  if (error) {
    await admin.auth.admin.deleteUser(student.userId);
    throw new Error(error.message);
  }
  credentials.push({ name: input.full_name, portal: "student", login: input.enrollment_no, password: student.password });

  // Siblings share one guardian, matched by mobile number.
  const { data: existing } = await admin.from("guardians").select("id").eq("phone", guardian_phone).maybeSingle();
  let guardianId: string = existing?.id;
  if (!guardianId) {
    const parent = await createAccount({
      role: "parent", fullName: guardian_name, email: guardian_email, phone: guardian_phone, identifiers: [guardian_phone],
    });
    const { data: g, error: gError } = await admin.from("guardians").insert({
      user_id: parent.userId, full_name: guardian_name, relation: guardian_relation, phone: guardian_phone, email: guardian_email,
    }).select("id").single();
    if (gError) throw new Error(gError.message);
    guardianId = g.id;
    credentials.push({ name: guardian_name, portal: "parent", login: guardian_phone, password: parent.password });
  }
  const { error: linkError } = await admin.from("student_guardians").insert({ student_id: created.id, guardian_id: guardianId, is_primary: true });
  if (linkError) throw new Error(linkError.message);
  return credentials;
}

export async function createStudent(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const profile = await assertRole(CAN_ONBOARD);
    const raw = Object.fromEntries([...form.entries()].filter(([, v]) => v !== ""));
    const parsed = studentSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(" ") };
    assertTierAllowed(profile, parsed.data.tier);
    const credentials = await onboard(parsed.data);
    revalidatePath("/students");
    return { ok: `${parsed.data.full_name} has been added.`, data: credentials };
  } catch (e) { return { error: friendlyError(e) }; }
}

async function readRows(file: File): Promise<Record<string, unknown>[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const parsed = Papa.parse<Record<string, unknown>>(await file.text(), { header: true, skipEmptyLines: "greedy" });
    return parsed.data;
  }
  if (!name.endsWith(".xlsx")) throw new Error("Upload a .csv or .xlsx file.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer() as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, col) => { headers[col] = String(cell.text ?? "").trim(); });
  const rows: Record<string, unknown>[] = [];
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    const out: Record<string, unknown> = {};
    headers.forEach((h, col) => { if (h) out[h] = row.getCell(col).text; });
    if (Object.values(out).some((v) => String(v ?? "").trim())) rows.push(out);
  });
  return rows;
}

export type ImportResult = { created: number; errors: { row: number; messages: string[] }[]; credentials: Credential[] };

export async function importStudents(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const profile = await assertRole(CAN_ONBOARD);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
    if (file.size > MAX_BYTES) return { error: "The file is larger than 10 MB." };
    const rows = await readRows(file);
    if (rows.length === 0) return { error: "No student rows were found in this file." };
    if (rows.length > MAX_ROWS) return { error: `Upload at most ${MAX_ROWS} students at a time.` };
    const result: ImportResult = { created: 0, errors: [], credentials: [] };
    // Row 1 is the header, so data starts at spreadsheet row 2.
    const parsed = rows.map((r, i) => parseImportRow(r, i + 2));
    const seen = new Set<string>();
    for (const row of parsed) {
      if (!row.ok) { result.errors.push({ row: row.row, messages: row.errors }); continue; }
      if (seen.has(row.value.enrollment_no)) { result.errors.push({ row: row.row, messages: ["Duplicate enrollment number in this file."] }); continue; }
      seen.add(row.value.enrollment_no);
      try {
        assertTierAllowed(profile, row.value.tier);
        result.credentials.push(...await onboard(row.value));
        result.created++;
      } catch (e) { result.errors.push({ row: row.row, messages: [friendlyError(e)] }); }
    }
    revalidatePath("/students");
    return { ok: `${result.created} of ${rows.length} students added.`, data: result };
  } catch (e) { return { error: friendlyError(e) }; }
}

export async function updateStatus(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole(CAN_ONBOARD);
    const id = String(form.get("id"));
    const status = String(form.get("status"));
    if (!["active", "suspended", "graduated", "alumni"].includes(status)) return { error: "Choose a valid status." };
    const supabase = await createClient();
    const { error } = await supabase.from("students").update({ status }).eq("id", id);
    if (error) throw error;
    revalidatePath(`/students/${id}`);
    return { ok: "Status updated." };
  } catch (e) { return { error: friendlyError(e) }; }
}

const DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export async function uploadDocument(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const profile = await assertRole(CAN_ONBOARD);
    const studentId = String(form.get("student_id"));
    const kind = String(form.get("kind"));
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
    if (file.size > MAX_BYTES) return { error: "The file is larger than 10 MB." };
    if (!DOC_TYPES.includes(file.type)) return { error: "Upload a PDF, JPG, PNG or WebP file." };
    const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
    const path = `${studentId}/${crypto.randomUUID()}-${safeName}`;
    const supabase = await createClient();
    const upload = await supabase.storage.from("student-documents").upload(path, file, { contentType: file.type });
    if (upload.error) throw upload.error;
    const { error } = await supabase.from("student_documents").insert({
      student_id: studentId, kind, storage_path: path, file_name: file.name, uploaded_by: profile.id,
    });
    if (error) { await supabase.storage.from("student-documents").remove([path]); throw error; }
    revalidatePath(`/students/${studentId}`);
    return { ok: "Document uploaded." };
  } catch (e) { return { error: friendlyError(e) }; }
}

export async function addRemark(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const profile = await assertRole(["super_admin", "management", "principal", "faculty"]);
    const studentId = String(form.get("student_id"));
    const body = String(form.get("body") ?? "").trim();
    if (!body) return { error: "Write the remark first." };
    const supabase = await createClient();
    const { error } = await supabase.from("student_remarks").insert({
      student_id: studentId, body, kind: String(form.get("kind") ?? "remark"),
      visible_to_parent: form.get("visible_to_parent") === "on", created_by: profile.id,
    });
    if (error) throw error;
    revalidatePath(`/students/${studentId}`);
    return { ok: "Remark saved." };
  } catch (e) { return { error: friendlyError(e) }; }
}
