// Reads a bill photo for the chat, all on the phone: the photo becomes text (Tesseract), then the
// browser's own on-device model tidies it into shop, total and items when it has one ready
// (Chrome's built-in Gemini Nano), otherwise the app's rules do.
import { readReceipt, guessCat } from "@/core/index.js";
import { readImageText } from "./ocr.js";
import { tidyBillText } from "./on-device-ai.js";
import { shrinkImage } from "./image.js";

/** A small copy of the photo for the chat history (kept in the browser's storage). */
export const billThumb = (file) => shrinkImage(file, { max: 360, quality: 0.7, limit: 60_000 });

/** { shop, total, date, category, items: [{ name, amount, category? }], source: "ai" | "device" } */
export async function readBill(file, onProgress = () => {}) {
  const text = await readImageText(file, onProgress);
  const r = readReceipt(text);
  const ai = await tidyBillText(text);
  const guess = (x) => guessCat(`${x.shop} ${x.items.map((i) => i.name).join(" ")}`, false);
  // the date always comes from the rules: it's printed in a fixed format and small models get it wrong
  if (ai) return { ...ai, date: r.date, category: ai.category || guess(ai), source: "ai" };
  return { ...r, category: guess(r), source: "device" };
}
