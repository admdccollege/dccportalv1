"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import * as Tabs from "@radix-ui/react-tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { login } from "@/app/login/actions";
import { LOGIN_COPY, PORTALS, type Portal } from "@/lib/roles";

const schema = z.object({
  identifier: z.string().trim().min(1, "This field is required."),
  password: z.string().min(1, "Enter your password."),
  remember: z.boolean(),
});
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const [portal, setPortal] = useState<Portal>("student");
  const [show, setShow] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const [pending, start] = useTransition();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema), defaultValues: { identifier: "", password: "", remember: true },
  });
  const copy = LOGIN_COPY[portal];

  function changePortal(value: string) {
    setPortal(value as Portal);
    setServerError(undefined);
    reset({ identifier: "", password: "", remember: true });
  }
  const onSubmit = handleSubmit((values) => {
    setServerError(undefined);
    start(async () => {
      const result = await login({ ...values, portal });
      if (result?.error) setServerError(result.error);
    });
  });

  return (
    <Tabs.Root value={portal} onValueChange={changePortal}>
      <Tabs.List aria-label="Choose how you sign in" className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--muted)] p-1 sm:grid-cols-4">
        {PORTALS.map((p) => (
          <Tabs.Trigger key={p} value={p}
            className="min-h-11 rounded-md px-2 text-sm font-medium text-[var(--ink-soft)] data-[state=active]:bg-[var(--surface)] data-[state=active]:text-[var(--brand)] data-[state=active]:shadow-sm">
            {LOGIN_COPY[p].tab}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content value={portal} className="mt-5" tabIndex={-1}>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <p className="text-sm text-[var(--ink-soft)]">{copy.helper}</p>
          <div>
            <label htmlFor="identifier" className="label">{copy.label}</label>
            <input id="identifier" className="input" autoComplete="username" placeholder={copy.placeholder}
              aria-invalid={!!errors.identifier} aria-describedby={errors.identifier ? "identifier-error" : undefined}
              {...register("identifier")} />
            {errors.identifier && <p id="identifier-error" className="field-error">{errors.identifier.message}</p>}
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <div className="relative">
              <input id="password" className="input pr-12" type={show ? "text" : "password"} autoComplete="current-password"
                aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined}
                {...register("password")} />
              <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[var(--ink-soft)]">
                {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
              </button>
            </div>
            {errors.password && <p id="password-error" className="field-error">{errors.password.message}</p>}
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5 accent-[var(--brand)]" {...register("remember")} /> Remember me
            </label>
            <Link href={`/forgot-password?role=${portal}`} className="flex min-h-11 items-center text-sm font-medium text-[var(--brand)] underline-offset-2 hover:underline">
              Forgot Credentials?
            </Link>
          </div>
          {serverError && <p role="alert" className="alert-error">{serverError}</p>}
          <button className="btn btn-primary w-full" disabled={pending}>
            {pending && <LoaderCircle size={18} className="animate-spin" aria-hidden />} {copy.cta}
          </button>
        </form>
      </Tabs.Content>
    </Tabs.Root>
  );
}
