"use client";
import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";

function keyBytes(key: string) {
  const padded = (key + "=".repeat((4 - (key.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export function PushToggle() {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "busy" | "blocked">("unsupported");
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!vapid || !("PushManager" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission === "denied") { setState("blocked"); return; }
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription())
      .then((s) => setState(s ? "on" : "off")).catch(() => setState("off"));
  }, [vapid]);

  if (state === "unsupported") return null;
  if (state === "blocked") return <p className="px-3 py-2 text-xs opacity-75">Alerts are blocked in your browser settings.</p>;

  async function toggle() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: existing.endpoint }) });
        await existing.unsubscribe();
        setState("off");
        return;
      }
      if ((await Notification.requestPermission()) !== "granted") { setState("blocked"); return; }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapid!) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) { await sub.unsubscribe(); throw new Error("Could not save the subscription"); }
      setState("on");
    } catch { setState("off"); }
  }
  return (
    <button onClick={toggle} disabled={state === "busy"} aria-pressed={state === "on"} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm hover:bg-white/10">
      <BellRing size={18} aria-hidden /> {state === "on" ? "Alerts on" : "Turn on alerts"}
    </button>
  );
}
