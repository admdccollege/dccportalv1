import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const REMEMBER_COOKIE = "dcc-remember";

export async function createClient() {
  const store = await cookies();
  const remember = store.get(REMEMBER_COOKIE)?.value !== "0";
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll(list) {
          try {
            for (const { name, value, options } of list) {
              // Without "Remember me", the session ends when the browser closes.
              const opts = { ...options };
              if (!remember) { delete opts.maxAge; delete opts.expires; }
              store.set(name, value, opts);
            }
          } catch {
            // Server Components cannot set cookies. Middleware refreshes the session instead.
          }
        },
      },
    },
  );
}
