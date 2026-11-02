import { z } from "zod";

const optional = z.string().trim().max(300).optional().transform((v) => v || null);
const required = (name: string) => z.string({ required_error: `${name} is required.` }).trim().min(1, `${name} is required.`).max(300);
const mobile = z.string().trim().transform((v) => v.replace(/[\s-]/g, "").replace(/^\+?91/, ""))
  .refine((v) => /^[6-9]\d{9}$/.test(v), "Enter a valid 10-digit mobile number.");
const semester = (max: number) => z.coerce.number({ invalid_type_error: "Semester is required." }).int().min(1).max(max, `Semester must be between 1 and ${max}.`);

const common = z.object({
  enrollment_no: required("Enrollment number"),
  full_name: required("Full name"),
  date_of_birth: z.string().trim().optional().transform((v) => v || null)
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use the date format YYYY-MM-DD."),
  gender: optional,
  phone: optional,
  email: z.string().trim().email("Enter a valid email.").optional().or(z.literal("")).transform((v) => v || null),
  address: optional,
  residential_category: z.enum(["day_scholar", "hostel", "other"]).optional().or(z.literal("")).transform((v) => v || "day_scholar"),
  guardian_name: required("Guardian name"),
  guardian_relation: z.string().trim().optional().transform((v) => v || "Guardian"),
  guardian_phone: mobile,
  guardian_email: z.string().trim().email("Enter a valid guardian email.").optional().or(z.literal("")).transform((v) => v || null),
});

export const studentSchema = z.discriminatedUnion("tier", [
  common.extend({
    tier: z.literal("higher_secondary"),
    class_level: z.enum(["XI", "XII"], { required_error: "Class must be XI or XII.", invalid_type_error: "Class must be XI or XII." }),
    stream: z.enum(["Arts", "Science", "Commerce"], { required_error: "Stream is required.", invalid_type_error: "Stream must be Arts, Science or Commerce." }),
    council_reg_no: optional,
    combination_subjects: z.string().optional().transform((v) => (v ?? "").split(/[;,]/).map((s) => s.trim()).filter(Boolean)),
  }),
  common.extend({
    tier: z.literal("undergraduate"),
    degree: required("Degree"),
    major_subject: required("Major subject"),
    minor_subject: optional,
    semester: semester(6),
    university_roll_no: optional,
    university_reg_no: optional,
  }),
  common.extend({
    tier: z.literal("postgraduate"),
    department_code: required("Department code"),
    specialization: required("Specialization"),
    semester: semester(4),
    previous_degree: required("Previous degree"),
    previous_degree_verified: z.union([z.boolean(), z.string()]).optional()
      .transform((v) => v === true || ["on", "true", "yes", "1"].includes(String(v).toLowerCase())),
  }),
]);
export type StudentInput = z.infer<typeof studentSchema>;

const TIER_ALIASES: Record<string, string> = {
  hs: "higher_secondary", "+2": "higher_secondary", "higher secondary": "higher_secondary", higher_secondary: "higher_secondary",
  ug: "undergraduate", college: "undergraduate", undergraduate: "undergraduate",
  pg: "postgraduate", masters: "postgraduate", "master's": "postgraduate", postgraduate: "postgraduate",
};

/** Works out a row's tier from its tier column, or else from which tier's fields are filled in. */
export function detectTier(row: Record<string, unknown>): string | null {
  const stated = String(row.tier ?? "").trim().toLowerCase();
  if (stated) return TIER_ALIASES[stated] ?? null;
  if (row.class_level || row.stream || row.council_reg_no) return "higher_secondary";
  if (row.specialization || row.previous_degree) return "postgraduate";
  if (row.degree || row.major_subject) return "undergraduate";
  return null;
}

export type ParsedRow = { row: number; ok: true; value: StudentInput } | { row: number; ok: false; errors: string[] };

export function parseImportRow(raw: Record<string, unknown>, rowNumber: number): ParsedRow {
  const cleaned = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k.trim().toLowerCase().replace(/[\s-]+/g, "_"), v == null ? "" : String(v).trim()])
      .filter(([, v]) => v !== ""),
  );
  const tier = detectTier(cleaned);
  if (!tier) return { row: rowNumber, ok: false, errors: ["Could not tell the tier. Add a tier column (HS, UG or PG)."] };
  const result = studentSchema.safeParse({ ...cleaned, tier });
  if (result.success) return { row: rowNumber, ok: true, value: result.data };
  return { row: rowNumber, ok: false, errors: result.error.issues.map((i) => i.message) };
}
