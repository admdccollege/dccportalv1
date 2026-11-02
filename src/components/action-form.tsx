"use client";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

export function ActionForm({ action, children, className, resetOnOk = true, render }: {
  action: Action; children: ReactNode; className?: string; resetOnOk?: boolean;
  render?: (state: ActionState) => ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok && resetOnOk) ref.current?.reset(); }, [state, resetOnOk]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state.error && <p role="alert" className="alert-error mt-3">{state.error}</p>}
      {state.ok && <p role="status" className="alert-ok mt-3">{state.ok}</p>}
      {render?.(state)}
    </form>
  );
}

export function Submit({ children, className = "btn btn-primary" }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending} aria-busy={pending}>{pending ? "Working…" : children}</button>;
}
