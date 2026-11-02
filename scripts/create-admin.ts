// Creates the first Super Admin. Usage: npm run create-admin -- <email> "<full name>" (reads .env.local via your shell)
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

async function main() {
  const [email, fullName] = process.argv.slice(2);
  if (!email || !fullName) throw new Error('Usage: npm run create-admin -- <email> "<full name>"');
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const password = randomBytes(12).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  const profile = await admin.from("profiles").insert({ id, full_name: fullName, email, role: "super_admin" });
  if (profile.error) throw profile.error;
  const login = await admin.from("login_identifiers").insert({ portal: "institutional", identifier: email.toLowerCase(), user_id: id });
  if (login.error) throw login.error;
  console.log(`Created ${email}. Temporary password: ${password}\nYou will be asked to change it after signing in.`);
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
