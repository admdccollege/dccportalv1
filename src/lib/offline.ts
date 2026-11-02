import { openDB, type DBSchema } from "idb";

export type AttendanceStatus = "P" | "A" | "L" | "E";
export type QueuedAttendance = {
  clientId: string; sectionId: string; date: string; slot: string;
  kind: "period" | "morning" | "afternoon" | "lecture" | "lab";
  records: { student_id: string; status: AttendanceStatus }[];
  sectionTitle: string; queuedAt: number; lastError?: string;
};
export type CachedRoster = {
  sectionId: string; title: string; tier: string;
  students: { id: string; full_name: string; enrollment_no: string }[];
  savedAt: number;
};
interface OfflineDb extends DBSchema {
  queue: { key: string; value: QueuedAttendance };
  rosters: { key: string; value: CachedRoster };
}

// public/sw.js opens this same database. Keep the name and version in step with it.
const db = () => openDB<OfflineDb>("dcc-offline", 1, {
  upgrade(d) {
    d.createObjectStore("queue", { keyPath: "clientId" });
    d.createObjectStore("rosters", { keyPath: "sectionId" });
  },
});

export const saveRosters = async (rosters: CachedRoster[]) => {
  const d = await db();
  const tx = d.transaction("rosters", "readwrite");
  await Promise.all([...rosters.map((r) => tx.store.put(r)), tx.done]);
};
export const loadRosters = async () => (await db()).getAll("rosters");
export const pendingAttendance = async () => (await db()).getAll("queue");

export async function enqueueAttendance(item: QueuedAttendance) {
  await (await db()).put("queue", item);
  const reg = await navigator.serviceWorker?.ready.catch(() => undefined);
  const sync = (reg as (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }) | undefined)?.sync;
  await sync?.register("attendance-sync").catch(() => undefined);
}

export function isPermanentFailure(status: number) {
  return status === 400 || status === 403 || status === 409 || status === 422;
}

/** Sends queued attendance. Keeps items on network errors. Also runs when Background Sync is unavailable. */
export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  const d = await db();
  let sent = 0, failed = 0;
  for (const item of await d.getAll("queue")) {
    let res: Response;
    try {
      res = await fetch("/api/attendance/sync", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify(item),
      });
    } catch { failed++; break; }
    if (res.ok) { await d.delete("queue", item.clientId); sent++; continue; }
    failed++;
    if (isPermanentFailure(res.status)) {
      const body = await res.json().catch(() => ({ error: "Rejected by the server" }));
      await d.put("queue", { ...item, lastError: body.error ?? "Rejected by the server" });
    }
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("dcc-queue-changed"));
  return { sent, failed };
}

export const discardQueued = async (clientId: string) => {
  await (await db()).delete("queue", clientId);
  window.dispatchEvent(new Event("dcc-queue-changed"));
};
