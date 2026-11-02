"use client";
import { ActionForm, Submit } from "@/components/action-form";
import { Credentials } from "@/components/credentials";
import { importStudents, type ImportResult } from "@/app/(portal)/students/actions";

export function ImportForm() {
  return (
    <ActionForm action={importStudents} className="space-y-3" render={(state) => {
      const r = state.data as ImportResult | undefined;
      if (!r) return null;
      return <>
        {r.errors.length > 0 && <div className="alert-error mt-3"><p className="mb-1 font-semibold">{r.errors.length} rows need attention</p>
          <ul className="max-h-72 list-disc space-y-1 overflow-y-auto pl-5">{r.errors.map((e) => <li key={e.row}>Row {e.row}: {e.messages.join(" ")}</li>)}</ul></div>}
        <Credentials items={r.credentials} />
      </>;
    }}>
      <div><label className="label" htmlFor="file">Student file</label>
        <input id="file" name="file" type="file" required accept=".csv,.xlsx" className="input" /></div>
      <Submit>Upload students</Submit>
    </ActionForm>
  );
}
