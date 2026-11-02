"use client";
import { useRef, useState } from "react";
import { Bold, Italic, Link2, List, ListOrdered, Underline } from "lucide-react";

// A small editor. The server sanitizes everything it receives before saving.
export function RichText({ name, id }: { name: string; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState("");
  const run = (command: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, value);
    setHtml(ref.current?.innerHTML ?? "");
  };
  const tools = [
    { label: "Bold", icon: Bold, run: () => run("bold") },
    { label: "Italic", icon: Italic, run: () => run("italic") },
    { label: "Underline", icon: Underline, run: () => run("underline") },
    { label: "Bulleted list", icon: List, run: () => run("insertUnorderedList") },
    { label: "Numbered list", icon: ListOrdered, run: () => run("insertOrderedList") },
    { label: "Add link", icon: Link2, run: () => { const url = window.prompt("Link address (https://…)"); if (url?.startsWith("http")) run("createLink", url); } },
  ];
  return <div className="rounded-lg border border-[var(--border)]">
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1 border-b border-[var(--border)] p-1">
      {tools.map(({ label, icon: Icon, run: act }) => <button key={label} type="button" aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={act} className="flex size-11 items-center justify-center rounded hover:bg-[var(--muted)]"><Icon size={18} aria-hidden /></button>)}
    </div>
    <div id={id} ref={ref} role="textbox" aria-multiline="true" aria-label="Notice text" contentEditable suppressContentEditableWarning
      onInput={(e) => setHtml(e.currentTarget.innerHTML)} className="notice-body min-h-40 bg-[var(--surface)] p-3 outline-none" />
    <input type="hidden" name={name} value={html} />
  </div>;
}
