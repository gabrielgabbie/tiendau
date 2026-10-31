// Tidies the text read from a bill photo with the browser's own on-device model (Chrome's built-in
// Gemini Nano, the Prompt API). Nothing leaves the phone and nothing is billed to anyone.
// Only used when the model is already on the device; otherwise (Safari, Chrome for Android today,
// older phones) the app's own rules read the bill. Big model downloads are never started from here.
import { EXP_CATS, amountsIn } from "../core/index.js";

const SCHEMA = {
  type: "object",
  properties: {
    shop: { type: "string" },
    total: { type: "integer" },
    items: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        properties: { name: { type: "string" }, amount: { type: "integer" }, category: { type: "string", enum: EXP_CATS } },
        required: ["name", "amount", "category"],
      },
    },
    category: { type: "string", enum: EXP_CATS },
  },
  required: ["shop", "total", "items", "category"],
};

const SYSTEM = `You turn the text of a scanned receipt (often Vietnamese, with OCR mistakes) into JSON.
Amounts are whole numbers: on Vietnamese bills "64.000" and "64,000" both mean 64000.
total is the final amount to pay (after discounts, with VAT and service charge), not cash given or change; 0 if you can't tell.
items are the purchased lines with their line totals; leave out totals, VAT, fees, discounts, cash and change.
shop is the shop name as printed, in normal capitalisation, or "" if unknown. Only use amounts that appear in the text.`;

const LM = () => (typeof globalThis.LanguageModel === "object" || typeof globalThis.LanguageModel === "function" ? globalThis.LanguageModel : null);
const OPTS = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };

/** True when this browser has an on-device model ready to use right now. */
export async function onDeviceAIReady() {
  try { return !!LM() && (await LM().availability(OPTS)) === "available"; } catch { return false; }
}

/** { shop, total, items: [{ name, amount, category }], category } from OCR text, or null when the model
 *  isn't ready or its answer doesn't match the bill (an amount it made up, nothing usable). */
export async function tidyBillText(text) {
  if (!text?.trim() || !(await onDeviceAIReady())) return null;
  let session;
  try {
    session = await LM().create({ ...OPTS, initialPrompts: [{ role: "system", content: SYSTEM }] });
    const out = JSON.parse(await session.prompt(`Receipt text:\n${text.slice(0, 6000)}`, { responseConstraint: SCHEMA }));
    return checked(out, text);
  } catch (e) {
    console.warn("On-device AI couldn't read this bill; using the rules", e);
    return null;
  } finally {
    session?.destroy?.();
  }
}

// Small models can invent numbers, so every amount must be one printed on the bill.
function checked(out, text) {
  const printed = new Set(text.split(/\n/).flatMap(amountsIn));
  const ok = (v) => Number.isInteger(v) && v > 0 && printed.has(v);
  const items = (Array.isArray(out?.items) ? out.items : [])
    .filter((x) => x && typeof x.name === "string" && x.name.trim() && ok(x.amount))
    .map((x) => ({ name: x.name.trim().slice(0, 80), amount: x.amount, category: EXP_CATS.includes(x.category) ? x.category : undefined }));
  const total = ok(out?.total) ? out.total : items.length ? items.reduce((a, x) => a + x.amount, 0) : null;
  if (!total) return null;
  return { shop: typeof out.shop === "string" ? out.shop.trim().slice(0, 80) : "", total, items, category: EXP_CATS.includes(out.category) ? out.category : undefined };
}
