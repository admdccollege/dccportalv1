import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getProfile()) redirect("/dashboard");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--brand)] p-4">
      <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <img src="/icons/icon-192.png" alt="" width={48} height={48} className="rounded-lg" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Damdei Christian College</h1>
            <p className="text-sm text-[var(--ink-soft)]">College Management Portal</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
