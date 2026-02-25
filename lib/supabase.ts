import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Pass cache: 'no-store' so Next.js's fetch wrapper never serves a stale
// cached response (e.g. empty arrays from before the tables were seeded).
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (url, options = {}) =>
      fetch(url, { ...options, cache: "no-store" }),
  },
});

/** Server-side admin client — only use in server components / scripts, never in "use client" files. */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (Settings → API → service_role in Supabase dashboard)."
    );
  }
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
