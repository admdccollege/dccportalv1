import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { PORTAL_ROLES, type Portal, type Role, type Tier } from "@/lib/roles";

export type NewAccount = {
  role: Role; fullName: string; email?: string | null; phone?: string | null;
  identifiers: string[]; departmentId?: string | null; isHod?: boolean; tiers?: Tier[];
};

const portalFor = (role: Role): Portal =>
  (Object.keys(PORTAL_ROLES) as Portal[]).find((p) => PORTAL_ROLES[p].includes(role))!;

// Avoids characters that are easily confused when read from a printed slip.
export function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(12), (b) => alphabet[b % alphabet.length]).join("");
}

/** Creates the sign-in account. Callers must have verified the requester's role. */
export async function createAccount(input: NewAccount): Promise<{ userId: string; password: string }> {
  const admin = createAdminClient();
  const identifiers = [...new Set(input.identifiers.map((i) => i.trim().toLowerCase()).filter(Boolean))];
  if (identifiers.length === 0) throw new Error("A login identifier is required.");
  const domain = process.env.ACCOUNT_EMAIL_DOMAIN ?? "accounts.dcc-portal.example";
  const authEmail = input.email?.trim().toLowerCase()
    || `${identifiers[0].replace(/[^a-z0-9]+/g, "-")}@${domain}`;
  const password = temporaryPassword();
  const { data, error } = await admin.auth.admin.createUser({ email: authEmail, password, email_confirm: true });
  if (error || !data.user) throw new Error(error?.message ?? "Could not create the account.");
  const userId = data.user.id;
  try {
    const { error: profileError } = await admin.from("profiles").insert({
      id: userId, full_name: input.fullName, email: input.email || null, phone: input.phone || null,
      role: input.role, department_id: input.departmentId ?? null, is_hod: input.isHod ?? false, tiers: input.tiers ?? [],
    });
    if (profileError) throw new Error(profileError.message);
    const portal = portalFor(input.role);
    const { error: idError } = await admin.from("login_identifiers").insert(
      identifiers.map((identifier) => ({ portal, identifier, user_id: userId })),
    );
    if (idError) throw new Error(idError.message);
  } catch (e) {
    // Leave no half-created login behind. Profile rows cascade with the user.
    await admin.auth.admin.deleteUser(userId);
    throw e;
  }
  return { userId, password };
}
