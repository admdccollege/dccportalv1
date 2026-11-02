"use client";
import type { Credential } from "@/app/(portal)/students/actions";

export function Credentials({ items }: { items: Credential[] }) {
  if (!items.length) return null;
  function download() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = ["Name,Portal,Login,Temporary password", ...items.map((c) => [c.name, c.portal, c.login, c.password].map(esc).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "dcc-new-logins.csv"; a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="alert-warn mt-3">
      <p className="mb-2 font-semibold">Hand these out now. Passwords are shown only once, and people must change them at first sign-in.</p>
      <div className="overflow-x-auto"><table className="data-table">
        <thead><tr><th>Name</th><th>Portal</th><th>Login</th><th>Temporary password</th></tr></thead>
        <tbody>{items.slice(0, 20).map((c) => <tr key={`${c.portal}${c.login}`}><td>{c.name}</td><td className="capitalize">{c.portal}</td><td>{c.login}</td><td className="font-mono">{c.password}</td></tr>)}</tbody>
      </table></div>
      {items.length > 20 && <p className="mt-2">Showing 20 of {items.length}. Download the file for the full list.</p>}
      <button type="button" className="btn btn-secondary mt-2" onClick={download}>Download logins (CSV)</button>
    </div>
  );
}
