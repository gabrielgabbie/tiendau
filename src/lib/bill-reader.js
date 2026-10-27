// Reads a bill photo for the chat: with Claude when /api/read-receipt is set up, otherwise on the phone.
import { readReceipt, guessCat } from "@/core/index.js";
import { readImageText } from "./ocr.js";
import { readReceiptWithAI } from "./ai-receipt.js";
import { shrinkImage } from "./image.js";

/** A small copy of the photo for the chat history (kept in the browser's storage). */
export const billThumb = (file) => shrinkImage(file, { max: 360, quality: 0.7, limit: 60_000 });

/** { shop, total, date, category, items: [{ name, amount, category? }], source: "ai" | "device" } */
export async function readBill(file, onProgress = () => {}) {
  try {
    return { ...(await readReceiptWithAI(file)), source: "ai" };
  } catch (err) {
    // not set up, offline, busy or declined: read on the phone instead
    if (err.code !== "not_configured") console.warn("Read with AI unavailable, reading on this phone:", err.code || err.message);
  }
  const r = readReceipt(await readImageText(file, onProgress));
  return { ...r, category: guessCat(`${r.shop} ${r.items.map((x) => x.name).join(" ")}`, false), source: "device" };
}
