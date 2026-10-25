// Date helpers. Dates are stored as "YYYY-MM-DD" strings in the user's local time.
import { t, locale } from "./i18n.js";

export const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const addDays = (n, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

/** Short month names in the current language. */
export const monthsShort = () => Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString(locale(), { month: "short" })
);

/** "Today", "Yesterday", or "23 Oct" (with weekday and year when asked). */
export function fmtDate(s, withYear) {
  if (!s) return "";
  const now = today();
  if (s === now) return t("Today");
  if (s === addDays(-1)) return t("Yesterday");
  const d = new Date(s + "T00:00");
  const o = { day: "numeric", month: "short" };
  if (withYear && s.slice(0, 4) !== now.slice(0, 4)) o.year = "numeric";
  if (withYear) o.weekday = "short";
  return d.toLocaleDateString(locale(), o);
}

export const fmtLong = (d) =>
  new Date(d + "T00:00").toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });

/** Move a "YYYY-MM" string by n months. */
export const ymAdd = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export const ymLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: "long", year: "numeric" });
};

export const lastDayOfMonth = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return ymd(new Date(y, m, 0));
};
