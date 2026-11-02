import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderMarkSheet, type CourseResult } from "@/lib/pdf";

// Reads through the signed-in user's session, so RLS decides who can download what.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: r } = await supabase.from("term_results")
    .select("*, students(full_name, enrollment_no), terms(label)").eq("id", id).eq("is_published", true).maybeSingle();
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const buffer = await renderMarkSheet({
    studentName: r.students.full_name, enrollmentNo: r.students.enrollment_no, tier: r.tier, term: r.terms.label,
    courses: r.courses as CourseResult[], percentage: r.percentage, division: r.division, sgpa: r.sgpa, cgpa: r.cgpa,
    creditsEarned: r.credits_earned, creditsRegistered: r.credits_registered, hash: r.verification_hash,
    verifyUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/verify/${r.verification_hash}`, publishedAt: r.published_at,
  });
  return new NextResponse(new Uint8Array(buffer), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="DCC-marksheet-${r.students.enrollment_no}.pdf"`, "Cache-Control": "private, no-store",
  } });
}
