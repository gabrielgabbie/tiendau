// Turns Supabase auth errors into plain-language messages.
import { t } from "@/core/index.js";

export function friendly(e) {
  const m = (e && (e.message || e.error_description)) || "";
  if (/invalid login credentials/i.test(m)) return t("That email and password don't match. Try again, or reset your password.");
  if (/email not confirmed/i.test(m)) return t("Confirm your email first. Check your inbox for the link we sent.");
  if (/already registered|already exists/i.test(m)) return t("There's already an account with this email. Sign in instead.");
  if (/rate limit|too many|security purposes/i.test(m)) return t("Too many tries. Wait a minute, then try again.");
  if (/provider is not enabled|unsupported provider/i.test(m)) return t("This sign-in option isn't turned on yet. Use another one.");
  if (/token has expired|otp.*(expired|invalid)|invalid.*otp/i.test(m)) return t("That code is wrong or has expired. Request a new one.");
  if (/password should be|weak password/i.test(m)) return t("Use a password with at least 8 characters.");
  if (/fetch|network/i.test(m)) return t("Can't reach the server. Check your connection and try again.");
  return m || t("Something went wrong. Try again.");
}
