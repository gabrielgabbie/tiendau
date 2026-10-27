// Interface language. Text is written in English in the code and looked up here;
// a missing translation falls back to the English text. The app picks the language at start-up.
import { VI } from "./i18n-vi.js";

export const LANGS = { vi: "Tiếng Việt", en: "English" };
let lang = "en";
export const setLang = (l) => { lang = LANGS[l] ? l : "en"; };
export const getLang = () => lang;
/** Locale for dates and times. */
export const locale = () => (lang === "vi" ? "vi-VN" : "en-GB");

const plural = (one, many) => (v) => (v.n === 1 ? one : many);
const EN = {
  "{n} records": plural("1 record", "{n} records"),
  "Added {n} records.": plural("Added 1 record.", "Added {n} records."),
  "{n} people": plural("1 person", "{n} people"),
  "{n} bills": plural("1 bill", "{n} bills"),
  "Added {n} records from {shop}, {amt} in total.": plural("Added 1 record from {shop}, {amt} in total.", "Added {n} records from {shop}, {amt} in total."),
  "Added {n} records from the bill, {amt} in total.": plural("Added 1 record from the bill, {amt} in total.", "Added {n} records from the bill, {amt} in total."),
  "{n} changes": plural("1 change", "{n} changes"),
  "{n} changes haven't synced. Tap again to sign out anyway": plural("1 change hasn't synced. Tap again to sign out anyway", "{n} changes haven't synced. Tap again to sign out anyway"),
  "{n} changes haven't synced. Tap again to sign out": plural("1 change hasn't synced. Tap again to sign out", "{n} changes haven't synced. Tap again to sign out"),
  "This device has {tx} records and {bills} shared bills from before you signed in. Add them to your account so they sync everywhere?": (v) =>
    `This device has ${v.tx} record${v.tx === 1 ? "" : "s"} and ${v.bills} shared bill${v.bills === 1 ? "" : "s"} from before you signed in. Add them to your account so they sync everywhere?`,
};

/** Translate `s`, filling {name} placeholders from `vars`. */
export function t(s, vars = {}) {
  const d = (lang === "vi" ? VI : EN)[s];
  const out = typeof d === "function" ? d(vars) : (d ?? s);
  return out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}
/** Has a translation for the current language (used to spot gaps). */
export const hasT = (s) => lang !== "vi" || s in VI;
