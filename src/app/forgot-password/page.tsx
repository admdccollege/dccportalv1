import Link from "next/link";
import { ActionForm, Submit } from "@/components/action-form";
import { requestReset } from "@/app/login/actions";
import { LOGIN_COPY, PORTALS, type Portal } from "@/lib/roles";

const HELP: Record<Portal, string> = {
  institutional: "We'll send a reset link to your DCC admin email.",
  staff: "We'll send a reset link to your academic email. If you have none on file, ask the college office.",
  parent: "If no email is on file, the college office can reset your access after checking your identity.",
  student: "If no email is on file, ask your department or the college office to reset your password.",
};

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  const portal: Portal = PORTALS.includes(role as Portal) ? (role as Portal) : "student";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--brand)] p-4">
      <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] p-6 sm:p-8">
        <h1 className="mb-1 text-xl font-semibold">Forgot credentials</h1>
        <p className="mb-5 text-sm text-[var(--ink-soft)]">{HELP[portal]}</p>
        <ActionForm action={requestReset} className="space-y-4">
          <input type="hidden" name="portal" value={portal} />
          <div>
            <label className="label" htmlFor="identifier">{LOGIN_COPY[portal].label}</label>
            <input id="identifier" name="identifier" required className="input" placeholder={LOGIN_COPY[portal].placeholder} />
          </div>
          <Submit className="btn btn-primary w-full">Send reset link</Submit>
        </ActionForm>
        <Link href="/login" className="mt-4 flex min-h-11 items-center text-sm font-medium text-[var(--brand)]">Back to sign in</Link>
      </div>
    </main>
  );
}
