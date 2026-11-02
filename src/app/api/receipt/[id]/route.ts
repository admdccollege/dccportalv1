import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderReceipt } from "@/lib/pdf";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from("payments").select("*, students(full_name, enrollment_no)").eq("id", id).maybeSingle();
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const buffer = await renderReceipt({
    receiptNo: p.receipt_no, studentName: p.students.full_name, enrollmentNo: p.students.enrollment_no, amount: p.amount, mode: p.mode,
    reference: p.reference, paidOn: p.paid_on, code: p.verification_code, verifyUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/verify/${p.verification_code}`, voided: !!p.voided_at,
  });
  return new NextResponse(new Uint8Array(buffer), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="DCC-receipt-${p.receipt_no.replace(/\//g, "-")}.pdf"`, "Cache-Control": "private, no-store",
  } });
}
