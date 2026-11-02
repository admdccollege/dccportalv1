export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <h1 className="mb-2 text-xl font-semibold">You're offline</h1>
        <p className="text-[var(--ink-soft)]">This page isn't saved on your device. Faculty can still mark attendance for classes opened earlier, and it will sync when you reconnect.</p>
        <a href="/attendance" className="btn btn-primary mt-5">Open attendance</a>
      </div>
    </main>
  );
}
