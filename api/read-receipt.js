// Reads a receipt photo with Claude and returns shop, total, date, category and items as JSON.
// Runs as a Vercel serverless function (POST /api/read-receipt). The API key stays on the server:
// set ANTHROPIC_API_KEY in Vercel → Project → Settings → Environment Variables (or in .env for local dev).
import Anthropic from "@anthropic-ai/sdk";

const CATEGORIES = ["Food & Drinks", "Transport", "Shopping", "Bills", "Housing", "Health", "Beauty & Care", "Entertainment", "Travel", "Education", "Gifts", "Other"];
const MAX_IMAGE_CHARS = 3_000_000; // ~2.2 MB of JPEG as base64; the app sends ~200–500 KB

const SCHEMA = {
  type: "object",
  properties: {
    readable: { type: "boolean", description: "false if the photo is not a receipt or bill, or too unclear to read" },
    shop: { type: "string", description: "Shop or merchant name as printed, in normal capitalisation; empty if unknown" },
    total: { type: ["integer", "null"], description: "Amount actually paid, as a whole number in the bill's currency (VND has no decimals): after discounts, including VAT and service charge. Not cash given, not change. null if not visible." },
    date: { type: ["string", "null"], format: "date", description: "Date printed on the bill as YYYY-MM-DD, or null if none" },
    category: { type: "string", enum: CATEGORIES, description: "Best spending category for this bill" },
    items: {
      type: "array",
      description: "Purchased line items (name without quantity or price, and the line total), at most 30. Leave out totals, VAT, fees, discounts, cash and change.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Item name in normal capitalisation, e.g. \"Phin sữa đá\"" },
          amount: { type: "integer", description: "Line total for this item (quantity × unit price)" },
          category: { type: "string", enum: CATEGORIES, description: "Spending category for this item" },
        },
        required: ["name", "amount", "category"],
        additionalProperties: false,
      },
    },
  },
  required: ["readable", "shop", "total", "date", "category", "items"],
  additionalProperties: false,
};

const SYSTEM = `You read photos of receipts and bills, mostly Vietnamese (cafés, restaurants, supermarkets, shops, utilities, Grab/ShopeeFood screenshots).
Extract what the person paid. Read amounts exactly as printed: in Vietnamese bills "64.000" and "64,000" both mean sixty-four thousand.
If several totals appear (tạm tính, giảm giá, VAT, tổng thanh toán), the total is the final amount to pay. Ignore cash given (tiền khách đưa) and change (tiền thối).
List each purchased item with its line total and its own category (a supermarket bill can mix food, household and personal-care items). Pick the bill's category from what was bought. Do not guess values you cannot see; use null instead.`;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body; // Vercel parses JSON for us
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > MAX_IMAGE_CHARS + 10_000) throw new Error("too large"); }
  return JSON.parse(raw || "{}");
}

// Only the app's own pages may call this, so other sites can't spend the API budget from a browser.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin fetches from some browsers omit it
  try { return new URL(origin).host === req.headers["x-forwarded-host"] || new URL(origin).host === req.headers.host; } catch { return false; }
}

let client;

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!process.env.ANTHROPIC_API_KEY) return send(res, 503, { error: "not_configured" });
  if (!sameOrigin(req)) return send(res, 403, { error: "origin" });

  let body;
  try { body = await readBody(req); } catch { return send(res, 413, { error: "too_large" }); }
  const m = typeof body.image === "string" && body.image.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return send(res, 400, { error: "image" });
  if (m[2].length > MAX_IMAGE_CHARS) return send(res, 413, { error: "too_large" });

  client ??= new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      // if a safety classifier declines, the API re-runs the request on its recommended fallback model
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
          { type: "text", text: `Read this bill. Today is ${new Date().toISOString().slice(0, 10)}.` },
        ],
      }],
    });
    if (response.stop_reason === "refusal") return send(res, 422, { error: "declined" });
    if (response.stop_reason === "max_tokens") return send(res, 502, { error: "incomplete" });
    const text = response.content.find((b) => b.type === "text")?.text;
    const out = JSON.parse(text);
    return send(res, 200, {
      readable: !!out.readable,
      shop: String(out.shop || "").slice(0, 60),
      total: Number.isFinite(out.total) && out.total > 0 ? out.total : null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(out.date || "") ? out.date : null,
      category: CATEGORIES.includes(out.category) ? out.category : "Other",
      items: (out.items || []).slice(0, 30).map((x) => ({ name: String(x.name).slice(0, 80), amount: Number(x.amount) || 0, category: CATEGORIES.includes(x.category) ? x.category : null })),
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return send(res, 503, { error: "bad_key" });
    if (err instanceof Anthropic.RateLimitError) return send(res, 429, { error: "busy" });
    if (err instanceof Anthropic.BadRequestError) { console.error("read-receipt 400:", err.message); return send(res, 400, { error: "rejected" }); }
    if (err instanceof Anthropic.APIError) { console.error("read-receipt API error", err.status, err.message); return send(res, 502, { error: "upstream" }); }
    console.error("read-receipt failed:", err);
    return send(res, 500, { error: "failed" });
  }
}
