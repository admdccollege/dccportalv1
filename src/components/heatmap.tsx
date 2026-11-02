export type Day = { date: string; status: "P" | "A" | "L" | "E" };
const COLOR = { P: "bg-[var(--ok)]", A: "bg-[var(--bad)]", L: "bg-[var(--accent)]", E: "bg-[var(--brand)]" };
const LABEL = { P: "Present", A: "Absent", L: "Late", E: "Excused" };
// When a day has several sessions, the worst one decides its colour.
const RANK = { A: 3, L: 2, E: 1, P: 0 };

export function AttendanceHeatmap({ days, weeks = 10 }: { days: Day[]; weeks?: number }) {
  const worst = new Map<string, Day["status"]>();
  for (const d of days) {
    const cur = worst.get(d.date);
    if (!cur || RANK[d.status] > RANK[cur]) worst.set(d.date, d.status);
  }
  const end = new Date(); end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end); start.setUTCDate(end.getUTCDate() - (weeks * 7 - 1));
  const cells: { date: string; status?: Day["status"] }[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    cells.push({ date, status: worst.get(date) });
  }
  return <div>
    <div className="grid w-fit grid-flow-col grid-rows-7 gap-1 overflow-x-auto" role="img" aria-label={`Attendance over the last ${weeks} weeks`}>
      {cells.map((c) => <span key={c.date} title={`${c.date}: ${c.status ? LABEL[c.status] : "No class"}`} className={`size-4 rounded-sm ${c.status ? COLOR[c.status] : "bg-[var(--muted)]"}`} />)}
    </div>
    <p className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--ink-soft)]">{(Object.keys(LABEL) as Day["status"][]).map((k) => <span key={k} className="flex items-center gap-1"><span className={`size-3 rounded-sm ${COLOR[k]}`} />{LABEL[k]}</span>)}</p>
  </div>;
}
