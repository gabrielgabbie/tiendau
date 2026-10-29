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

/** Sign-in options shown on the sign-in screen. Google and email+password are on unless
 *  VITE_AUTH_<NAME>=false; Apple and the emailed one-time code are off until VITE_AUTH_APPLE=true /
 *  VITE_AUTH_EMAIL_CODE=true (Apple needs a paid developer account, the code needs custom SMTP). */
export const providers = {
  google: env.VITE_AUTH_GOOGLE !== "false",
  apple: env.VITE_AUTH_APPLE === "true",
  email: env.VITE_AUTH_EMAIL !== "false",
  emailCode: env.VITE_AUTH_EMAIL !== "false" && env.VITE_AUTH_EMAIL_CODE === "true",
};

/** Swap in another client (used by tests, or to point at a different project at runtime). */
export function useClient(client) {
  supabase = client;
}
