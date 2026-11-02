import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Verify a document", robots: { index: false } };
type Sheet = { student_name: string; enrollment_no: string; term: string; published_at: string };
type Rcpt = { receipt_no: string; student_name: string; amount: number; paid_on: string; is_void: boolean };

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const isReceipt = code.length === 16;
  const sheet: Sheet | undefined = isReceipt ? undefined : (await supabase.rpc("verify_mark_sheet", { p_hash: code })).data?.[0];
  const receipt: Rcpt | undefined = isReceipt ? (await supabase.rpc("verify_receipt", { p_code: code })).data?.[0] : undefined;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <h1 className="mb-3 text-lg font-semibold">Damdei Christian College document check</h1>
        {sheet && <div className="alert-ok"><p className="font-semibold">Genuine mark sheet</p><p>{sheet.student_name} ({sheet.enrollment_no})</p><p>{sheet.term}</p></div>}
        {receipt && (receipt.is_void
          ? <div className="alert-error"><p className="font-semibold">This receipt has been voided</p><p>{receipt.receipt_no}</p></div>
          : <div className="alert-ok"><p className="font-semibold">Genuine receipt</p><p>{receipt.receipt_no}, {receipt.student_name}</p><p>Rs. {Number(receipt.amount).toLocaleString("en-IN")} on {receipt.paid_on}</p></div>)}
        {!sheet && !receipt && <p className="alert-error">No document matches this code. It may have been reissued or altered.</p>}
      </div>
    </main>
  );
}
