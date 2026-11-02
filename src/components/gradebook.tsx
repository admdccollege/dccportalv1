"use client";
import { useMemo, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { saveMarks, setPublished } from "@/app/(portal)/marks/actions";

export type Assessment = { id: string; name: string; kind: string; max_marks: number; weightage: number; is_published: boolean };
export type Student = { id: string; full_name: string; enrollment_no: string };
type Mark = { assessment_id: string; student_id: string; marks: number | null; is_absent: boolean };
const key = (a: string, s: string) => `${a}:${s}`;
const ABSENT = "AB";

// Type a number, or AB for absent. Arrow keys and Enter move between cells.
export function Gradebook({ assessments, students, marks }: { assessments: Assessment[]; students: Student[]; marks: Mark[] }) {
  const router = useRouter();
  const initial = useMemo(() => Object.fromEntries(marks.map((m) => [key(m.assessment_id, m.student_id), m.is_absent ? ABSENT : String(m.marks ?? "")])), [marks]);
  const [cells, setCells] = useState<Record<string, string>>(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();

  const invalid = (a: Assessment, v: string) => {
    if (!v || v.toUpperCase() === ABSENT) return false;
    const n = Number(v);
    return Number.isNaN(n) || n < 0 || n > Number(a.max_marks);
  };
  const hasErrors = assessments.some((a) => students.some((s) => invalid(a, cells[key(a.id, s.id)] ?? "")));

  const save = useMutation({
    mutationFn: async () => {
      const rows: Mark[] = [];
      for (const a of assessments) for (const s of students) {
        const v = (cells[key(a.id, s.id)] ?? "").trim();
        if (v === (initial[key(a.id, s.id)] ?? "")) continue;
        const absent = v.toUpperCase() === ABSENT;
        rows.push({ assessment_id: a.id, student_id: s.id, is_absent: absent, marks: absent || v === "" ? null : Number(v) });
      }
      if (!rows.length) return { saved: 0 };
      return saveMarks(rows);
    },
    onSuccess: (r) => {
      if (r.error) setMessage({ ok: false, text: r.error });
      else { setMessage({ ok: true, text: r.saved ? `${r.saved} marks saved.` : "No changes to save." }); router.refresh(); }
    },
    onError: () => setMessage({ ok: false, text: "Could not save. Check your connection and try again." }),
  });

  function move(e: KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    const delta: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], Enter: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const d = delta[e.key];
    if (!d) return;
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && e.currentTarget.value) return;
    e.preventDefault();
    document.getElementById(`cell-${row + d[0]}-${col + d[1]}`)?.focus();
  }
  async function togglePublish(a: Assessment) {
    const r = await setPublished(a.id, !a.is_published);
    if (r.error) setMessage({ ok: false, text: r.error }); else router.refresh();
  }

  if (!assessments.length) return <p className="card">Add an assessment below to start entering marks.</p>;
  return (
    <section className="card">
      <p className="mb-2 text-sm text-[var(--ink-soft)]">Type a mark, or AB for absent. Use the arrow keys or Enter to move between cells.</p>
      <div className="max-h-[70vh] overflow-auto">
        <table className="data-table">
          <thead className="sticky top-0 z-10 bg-[var(--surface)]">
            <tr><th className="sticky left-0 bg-[var(--surface)]">Student</th>
              {assessments.map((a) => <th key={a.id} scope="col">
                {a.name}<br /><span className="font-normal">Max {a.max_marks}, weight {a.weightage}%</span><br />
                <button type="button" onClick={() => togglePublish(a)} className="mt-1 min-h-8 text-xs font-medium text-[var(--brand)] underline">{a.is_published ? "Published. Unpublish" : "Publish"}</button>
              </th>)}</tr>
          </thead>
          <tbody>
            {students.map((s, r) => <tr key={s.id}>
              <th scope="row" className="sticky left-0 bg-[var(--surface)] font-medium">{s.full_name}<br /><span className="text-xs font-normal text-[var(--ink-soft)]">{s.enrollment_no}</span></th>
              {assessments.map((a, c) => {
                const v = cells[key(a.id, s.id)] ?? "";
                const bad = invalid(a, v);
                return <td key={a.id}>
                  <input id={`cell-${r}-${c}`} value={v} inputMode="decimal" aria-label={`${a.name}, ${s.full_name}`} aria-invalid={bad}
                    title={bad ? `Must be between 0 and ${a.max_marks}, or AB` : undefined}
                    onChange={(e) => setCells((x) => ({ ...x, [key(a.id, s.id)]: e.target.value }))} onKeyDown={(e) => move(e, r, c)}
                    className="input w-20 text-center" />
                </td>;
              })}
            </tr>)}
          </tbody>
        </table>
      </div>
      {hasErrors && <p className="alert-error mt-3">Fix the highlighted marks before saving. A mark can't exceed the maximum.</p>}
      {message && <p role="status" className={`${message.ok ? "alert-ok" : "alert-error"} mt-3`}>{message.text}</p>}
      <button className="btn btn-primary mt-3" disabled={hasErrors || save.isPending} onClick={() => { setMessage(undefined); save.mutate(); }}>{save.isPending ? "Saving…" : "Save marks"}</button>
    </section>
  );
}
