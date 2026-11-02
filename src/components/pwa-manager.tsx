"use client";
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { flushQueue } from "@/lib/offline";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const DISMISSED = "dcc-install-dismissed";

export function PwaManager() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const dismissed = (() => { try { return localStorage.getItem(DISMISSED) === "1"; } catch { return false; } })();
    const onPrompt = (e: Event) => {
      e.preventDefault();
      if (!dismissed) setInstallEvent(e as InstallEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    const onOnline = () => { flushQueue().catch(() => undefined); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    // iOS has no install prompt, so people need to be told how to do it.
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    if (!dismissed && !standalone && /iphone|ipad|ipod/i.test(navigator.userAgent)) setIosHint(true);
    if (navigator.onLine) flushQueue().catch(() => undefined);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (!installEvent && !iosHint) return null;
  const dismiss = () => {
    try { localStorage.setItem(DISMISSED, "1"); } catch { /* storage may be blocked */ }
    setInstallEvent(null); setIosHint(false);
  };
  return (
    <div role="region" aria-label="Install app" className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-2 rounded-xl bg-[var(--brand)] p-3 text-white shadow-lg">
      <p className="flex-1 text-sm">
        {iosHint ? "Install DCC Portal: tap Share, then Add to Home Screen." : "Install DCC Portal for quick access, even with poor connectivity."}
      </p>
      {installEvent && (
        <button className="btn bg-white text-[var(--brand)]" onClick={async () => {
          await installEvent.prompt(); await installEvent.userChoice; setInstallEvent(null);
        }}><Download size={16} aria-hidden /> Install</button>
      )}
      <button aria-label="Dismiss" onClick={dismiss} className="flex size-11 items-center justify-center"><X size={18} aria-hidden /></button>
    </div>
  );
}
