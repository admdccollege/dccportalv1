"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, REMEMBER_COOKIE } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PORTALS, PORTAL_ROLES, type Portal, type Role } from "@/lib/roles";

const loginSchema = z.object({
  portal: z.enum(PORTALS),
  identifier: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
  remember: z.boolean(),
});
const GENERIC = "Those details don't match our records. Check them and try again.";

async function resolveAuthEmail(portal: Portal, identifier: string): Promise<string | null> {
  const admin = createAdminClient();
  const key = identifier.trim().toLowerCase();
  const { data } = await admin.from("login_identifiers").select("user_id")
    .eq("portal", portal).eq("identifier", key).maybeSingle();
  if (!data) return null;
  const { data: found } = await admin.auth.admin.getUserById(data.user_id);
  return found.user?.email ?? null;
}

export async function login(input: z.infer<typeof loginSchema>): Promise<{ error: string } | void> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: GENERIC };
  const { portal, identifier, password, remember } = parsed.data;
  const email = await resolveAuthEmail(portal, identifier);
  if (!email) return { error: GENERIC };

  const store = await cookies();
  store.set(REMEMBER_COOKIE, remember ? "1" : "0", {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
    ...(remember ? { maxAge: 60 * 60 * 24 * 30 } : {}),
  });
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: GENERIC };

  const { data: profile } = await supabase.from("profiles")
    .select("role, is_active").eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.is_active || !PORTAL_ROLES[portal].includes(profile.role as Role)) {
    await supabase.auth.signOut();
    return { error: GENERIC };
  }
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const forgotSchema = z.object({ portal: z.enum(PORTALS), identifier: z.string().trim().min(1).max(200) });

export async function requestReset(_: unknown, form: FormData): Promise<{ ok?: string; error?: string }> {
  const parsed = forgotSchema.safeParse({ portal: form.get("portal"), identifier: form.get("identifier") });
  if (!parsed.success) return { error: "Enter your ID to continue." };
  const email = await resolveAuthEmail(parsed.data.portal, parsed.data.identifier);
  const domain = process.env.ACCOUNT_EMAIL_DOMAIN ?? "accounts.dcc-portal.example";
  if (email && !email.endsWith(`@${domain}`)) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
    });
  }
  // The same reply either way, so this form can't reveal who has an account.
  return { ok: "If this account has an email on file, a reset link is on its way. Otherwise, please contact the college office." };
}

const passwordSchema = z.string().min(10, "Use at least 10 characters.").max(200);

export async function changePassword(_: unknown, form: FormData): Promise<{ ok?: string; error?: string }> {
  const parsed = passwordSchema.safeParse(form.get("password"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (form.get("password") !== form.get("confirm")) return { error: "The two passwords don't match." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your reset link has expired. Please request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: error.message };
  await createAdminClient().from("profiles").update({ must_change_password: false }).eq("id", user.id);
  redirect("/dashboard");
}
