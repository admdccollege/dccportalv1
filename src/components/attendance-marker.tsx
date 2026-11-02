"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CloudOff, RefreshCw } from "lucide-react";
import {
  discardQueued, enqueueAttendance, flushQueue, loadRosters, pendingAttendance, saveRosters,
  type AttendanceStatus, type CachedRoster, type QueuedAttendance,
} from "@/lib/offline";

const STATUSES: { value: AttendanceStatus; label: string; on: string }[] = [
  { value: "P", label: "Present", on: "bg-[var(--ok)] text-white" },
  { value: "A", label: "Absent", on: "bg-[var(--bad)] text-white" },
  { value: "L", label: "Late", on: "bg-[var(--warn)] text-white" },
  { value: "E", label: "Excused", on: "bg-[var(--brand)] text-white" },
];
const HS_SLOTS = ["Morning", "Afternoon", "Period 1", "Period 2", "Period 3", "Period 4", "Period 5", "Period 6"];
const COLLEGE_SLOTS = ["Period 1", "Period 2", "Period 3", "Period 4", "Period 5", "Period 6", "Lab 1", "Lab 2"];

function localDate() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function kindFor(slot: string, tier: string): QueuedAttendance["kind"] {
  if (slot === "Morning") return "morning";
  if (slot === "Afternoon") return "afternoon";
  if (slot.startsWith("Lab")) return "lab";
  return tier === "higher_secondary" ? "period" : "lecture";
}

export function AttendanceMarker({ initialRosters }: { initialRosters: CachedRoster[] }) {
  const [rosters, setRosters] = useState(initialRosters);
  const [sectionId, setSectionId] = useState(initialRosters[0]?.sectionId ?? "");
  const [date, setDate] = useState(localDate);
  const [slot, setSlot] = useState("Period 1");
  const [absences, setAbsences] = useState<Record<string, AttendanceStatus>>({});
  const [queue, setQueue] = useState<QueuedAttendance[]>([]);
  const [online, setOnline] = useState(true);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string }>();

  const refreshQueue = useCallback(() => { pendingAttendance().then(setQueue).catch(() => undefined); }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    if (initialRosters.length) saveRosters(initialRosters).catch(() => undefined);
    else loadRosters().then((cached) => {
      if (cached.length) { setRosters(cached); setSectionId(cached[0].sectionId); }
    }).catch(() => undefined);
    refreshQueue();
    const on = () => setOnline(true), off = () => setOnline(false);
    const onSwMessage = (e: MessageEvent) => { if (e.data === "attendance-synced") refreshQueue(); };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("dcc-queue-changed", refreshQueue);
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("dcc-queue-changed", refreshQueue);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, [initialRosters, refreshQueue]);

  const roster = useMemo(() => rosters.find((r) => r.sectionId === sectionId), [rosters, sectionId]);
  const slots = roster?.tier === "higher_secondary" ? HS_SLOTS : COLLEGE_SLOTS;
  const statusOf = (id: string): AttendanceStatus => absences[id] ?? "P";
  const counts = useMemo(() => {
    const c = { P: 0, A: 0, L: 0, E: 0 };
    roster?.students.forEach((s) => { c[statusOf(s.id)]++; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, absences]);

  // Saved to the device first, so a dropped connection can't lose the register.
  const save = useMutation({
    mutationFn: async () => {
      if (!roster) throw new Error("Choose a class first.");
      const item: QueuedAttendance = {
        clientId: crypto.randomUUID(), sectionId: roster.sectionId, date, slot,
        kind: kindFor(slot, roster.tier), sectionTitle: roster.title, queuedAt: Date.now(),
        records: roster.students.map((s) => ({ student_id: s.id, status: statusOf(s.id) })),
      };
      await enqueueAttendance(item);
      if (navigator.onLine) await flushQueue();
      return (await pendingAttendance()).find((q) => q.clientId === item.clientId);
    },
    onSuccess: (stillQueued) => {
      refreshQueue();
      if (stillQueued?.lastError) setMessage({ tone: "warn", text: stillQueued.lastError });
      else if (stillQueued) setMessage({ tone: "warn", text: "Saved on this device. It will sync when you're back online." });
      else { setMessage({ tone: "ok", text: "Attendance saved." }); setAbsences({}); }
    },
    onError: (e: Error) => setMessage({ tone: "warn", text: e.message }),
  });

  if (!rosters.length) return <p className="card">No classes are assigned to you for the current term. Connect once while online to save your classes on this device.</p>;

  return (
    <div className="space-y-4">
      {!online && <p className="alert-warn flex items-center gap-2"><CloudOff size={16} aria-hidden /> You're offline. Attendance will be saved on this device.</p>}
      <div className="card form-grid">
        <div><label htmlFor="section" className="label">Class</label>
          <select id="section" className="input" value={sectionId} onChange={(e) => { setSectionId(e.target.value); setAbsences({}); setMessage(undefined); }}>
            {rosters.map((r) => <option key={r.sectionId} value={r.sectionId}>{r.title}</option>)}
          </select></div>
        <div><label htmlFor="date" className="label">Date</label>
          <input id="date" type="date" className="input" value={date} max={localDate()} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label htmlFor="slot" className="label">Session</label>
          <select id="slot" className="input" value={slot} onChange={(e) => setSlot(e.target.value)}>
            {slots.map((s) => <option key={s}>{s}</option>)}
          </select></div>
      </div>

      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm" aria-live="polite">Present {counts.P} · Absent {counts.A} · Late {counts.L} · Excused {counts.E}</p>
          <button type="button" className="btn btn-secondary" onClick={() => setAbsences({})}>All Present</button>
        </div>
        <ul className="divide-y divide-[var(--muted)]">
          {roster?.students.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-40"><span className="font-medium">{s.full_name}</span><br /><span className="text-xs text-[var(--ink-soft)]">{s.enrollment_no}</span></span>
              <span role="radiogroup" aria-label={`Attendance for ${s.full_name}`} className="flex gap-1">
                {STATUSES.map((st) => {
                  const on = statusOf(s.id) === st.value;
                  return (
                    <button key={st.value} type="button" role="radio" aria-checked={on} aria-label={st.label} title={st.label}
                      onClick={() => setAbsences((a) => ({ ...a, [s.id]: st.value }))}
                      className={`size-11 rounded-lg border border-[var(--border)] font-bold ${on ? st.on : "bg-[var(--surface)]"}`}>
                      {st.value}
                    </button>
                  );
                })}
              </span>
            </li>
          ))}
        </ul>
        {roster?.students.length === 0 && <p className="text-sm text-[var(--ink-soft)]">No active students are enrolled in this class.</p>}
        {message && <p role="status" className={`${message.tone === "ok" ? "alert-ok" : "alert-warn"} mt-3`}>{message.text}</p>}
        <button className="btn btn-primary mt-3 w-full sm:w-auto" disabled={save.isPending || !roster?.students.length} onClick={() => { setMessage(undefined); save.mutate(); }}>
          {save.isPending ? "Saving…" : "Save attendance"}
        </button>
      </div>

      {queue.length > 0 && (
        <section className="card" aria-label="Waiting to sync">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="section-title mb-0">Waiting to sync ({queue.length})</h2>
            <button className="btn btn-secondary" disabled={!online} onClick={() => flushQueue().then(refreshQueue)}><RefreshCw size={16} aria-hidden /> Sync now</button>
          </div>
          <ul className="space-y-2 text-sm">
            {queue.map((q) => (
              <li key={q.clientId} className="flex flex-wrap items-center justify-between gap-2">
                <span>{q.sectionTitle}, {q.date}, {q.slot}{q.lastError && <span className="block text-[var(--bad)]">{q.lastError}</span>}</span>
                {q.lastError && <button className="btn btn-danger" onClick={() => discardQueued(q.clientId)}>Discard</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
