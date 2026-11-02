import { ActionForm, Submit } from "@/components/action-form";
import { changePassword } from "@/app/login/actions";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--brand)] p-4">
      <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] p-6 sm:p-8">
        <h1 className="mb-1 text-xl font-semibold">Set a new password</h1>
        <p className="mb-5 text-sm text-[var(--ink-soft)]">Use at least 10 characters.</p>
        <ActionForm action={changePassword} className="space-y-4">
          <div><label className="label" htmlFor="password">New password</label>
            <input id="password" name="password" type="password" minLength={10} required autoComplete="new-password" className="input" /></div>
          <div><label className="label" htmlFor="confirm">Confirm password</label>
            <input id="confirm" name="confirm" type="password" minLength={10} required autoComplete="new-password" className="input" /></div>
          <Submit className="btn btn-primary w-full">Save password</Submit>
        </ActionForm>
      </div>
    </main>
  );
}
