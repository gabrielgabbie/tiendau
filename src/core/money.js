// Currency formatting and rounding. No UI or storage here, so a native app can reuse it.

export const CURRENCIES = {
  VND: { sym: "₫", dec: 0, loc: "vi-VN", after: true },
  USD: { sym: "$", dec: 2, loc: "en-US" },
  EUR: { sym: "€", dec: 2, loc: "de-DE", after: true },
  SGD: { sym: "S$", dec: 2, loc: "en-SG" },
  THB: { sym: "฿", dec: 2, loc: "th-TH" },
  JPY: { sym: "¥", dec: 0, loc: "ja-JP" },
};

let current = "VND";

export function setCurrency(code) {
  if (CURRENCIES[code]) current = code;
}
export const currencyCode = () => current;
export const cur = () => CURRENCIES[current] || CURRENCIES.VND;

/** Format an amount, e.g. 55000 → "55.000 ₫". `sign: true` adds "+" for positive values. */
export function money(n, opts = {}) {
  const c = cur();
  const v = Math.abs(n);
  const s = new Intl.NumberFormat(c.loc, { minimumFractionDigits: c.dec, maximumFractionDigits: c.dec }).format(v);
  const sign = opts.sign && n !== 0 ? (n < 0 ? "−" : "+") : n < 0 ? "−" : "";
  return c.after ? `${sign}${s} ${c.sym}` : `${sign}${c.sym}${s}`;
}

/** Round to the currency's smallest unit (whole đồng, cents…). */
export const round = (n) => {
  const f = 10 ** cur().dec;
  return Math.round(n * f) / f;
};

/** Tolerance used when checking that amounts add up. */
export const eps = () => (cur().dec ? 0.005 : 0.5);

/** Short form for tight spaces: 8500000 → "8.5tr" in VND, "$8.5K" style elsewhere. */
export function compact(n) {
  const c = cur();
  if (c.dec) return new Intl.NumberFormat(c.loc, { notation: "compact", maximumFractionDigits: 1 }).format(n);
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "tr";
  if (n >= 1e3) return Math.round(n / 1e3) + "k";
  return String(n);
}
