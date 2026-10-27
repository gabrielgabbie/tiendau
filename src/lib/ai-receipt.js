// "Read with AI": sends a shrunken copy of the bill photo to our /api/read-receipt function,
// which asks Claude for shop, total, date, category and items. Costs about a cent per photo.
import { shrinkImage } from "./image.js";

/** Error codes from the function, mapped to what the app says. */
export const AI_ERRORS = {
  not_configured: "AI reading isn't set up yet. Add ANTHROPIC_API_KEY on Vercel (or in .env when testing).",
  bad_key: "The Anthropic API key isn't valid. Check ANTHROPIC_API_KEY.",
  busy: "The AI is busy. Try again in a moment.",
  declined: "The AI couldn't read this photo.",
  too_large: "That photo is too large.",
  offline: "Reading with AI needs an internet connection.",
};

export async function readReceiptWithAI(file) {
  const image = await shrinkImage(file, { max: 1600, quality: 0.8, limit: 1_500_000 });
  let res;
  try {
    res = await fetch("/api/read-receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
  } catch {
    throw Object.assign(new Error("offline"), { code: "offline" });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { code: data.error || "failed" });
  return data;
}
