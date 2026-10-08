import { cookies } from "next/headers";
import { createBrowserClient, createServerClient } from "@supabase/ssr";

import { env, hasSupabaseConfig } from "@/lib/env";

export function createClientSupabaseBrowser() {
  if (!hasSupabaseConfig()) return null;
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}

export async function createClientSupabaseServer() {
  if (!hasSupabaseConfig()) return null;
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Ignore set failures in server components.
        }
      },
    },
  });
}
