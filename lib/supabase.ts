import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client — uses cookies so the middleware can read the auth session.
// Safe to call at module level in "use client" files.
export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);

/** Server-side admin client — only use in server components / scripts, never in "use client" files.
 *  Falls back to the anon key if SUPABASE_SERVICE_ROLE_KEY is not set (e.g. Vercel env not configured). */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? supabaseAnonKey;
  return createClient<Database>(supabaseUrl, key, {
    auth: { persistSession: false },
  });
}
