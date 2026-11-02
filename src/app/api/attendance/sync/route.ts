import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const body = z.object({
  clientId: z.string().uuid(), sectionId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), slot: z.string().trim().min(1).max(40),
  kind: z.enum(["period", "morning", "afternoon", "lecture", "lab"]),
  records: z.array(z.object({ student_id: z.string().uuid(), status: z.enum(["P", "A", "L", "E"]) })).min(1).max(1000),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid attendance data" }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { clientId, sectionId, date, slot, kind, records } = parsed.data;
  const { data, error } = await supabase.rpc("save_attendance", {
    p_client_id: clientId, p_section_id: sectionId, p_date: date, p_slot: slot, p_kind: kind, p_records: records,
  });
  if (error) {
    // These won't succeed on retry, so the device shows them instead of looping.
    const permanent = /row-level security|locked|future|too old|not enrolled|permission/i.test(error.message);
    const message = /row-level security/i.test(error.message) ? "You are not assigned to this class." : error.message;
    return NextResponse.json({ error: message }, { status: permanent ? 422 : 500 });
  }
  return NextResponse.json({ sessionId: data });
}
