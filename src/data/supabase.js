import { createClient } from "@supabase/supabase-js";

const env = import.meta.env || {};
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

/** null when the project isn't configured yet; the app then runs in device-only mode. */
export let supabase =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
      })
    : null;

/** Sign-in options shown on the sign-in screen. Turn one off with VITE_AUTH_<NAME>=false. */
export const providers = {
  google: env.VITE_AUTH_GOOGLE !== "false",
  apple: env.VITE_AUTH_APPLE !== "false",
  email: env.VITE_AUTH_EMAIL !== "false",
};

/** Swap in another client (used by tests, or to point at a different project at runtime). */
export function useClient(client) {
  supabase = client;
}
