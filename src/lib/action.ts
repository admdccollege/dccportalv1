export type ActionState = { ok?: string; error?: string; data?: unknown };

/** Turns database errors into messages staff can act on. */
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message
    : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message)
    : "Something went wrong.";
  if (message.includes("timetable_no_faculty_clash")) return "This faculty member already has a class at that time.";
  if (message.includes("timetable_no_room_clash")) return "This room is already booked at that time.";
  if (message.includes("students_tier_fields")) return "Some required fields for this academic tier are missing.";
  if (message.includes("row-level security")) return "You do not have permission to change this record.";
  if (message.includes("duplicate key")) return "A record with these details already exists.";
  return message;
}
