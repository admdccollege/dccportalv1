import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role, Tier } from "@/lib/roles";

export type Profile = {
  id: string; full_name: string; email: string | null; role: Role; department_id: string | null;
  is_hod: boolean; tiers: Tier[]; is_active: boolean; must_change_password: boolean;
};

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!data || !data.is_active) return null;
  return data as Profile;
}

/** For pages: sends people without access to sign-in or their dashboard. */
export async function requireRole(roles?: readonly Role[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (roles && !roles.includes(profile.role)) redirect("/dashboard");
  return profile;
}

/** For server actions and routes: throws rather than redirecting. */
export async function assertRole(roles?: readonly Role[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) throw new Error("Please sign in again.");
  if (roles && !roles.includes(profile.role)) throw new Error("You do not have permission to do this.");
  return profile;
}
