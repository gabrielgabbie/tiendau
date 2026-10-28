// Interface language. Text is written in English in the code and looked up here;
// a missing translation falls back to the English text. The app picks the language at start-up.
import { VI } from "./i18n-vi.js";
import { MT } from "./i18n-mt.js";
import { GZ } from "./i18n-gz.js";

// "mt" (miền Tây) and "gz" (Gen Z) are flavours of Vietnamese: each lists only what differs, the rest comes from VI.
export const LANGS = { vi: "Tiếng Việt", mt: "Miền Tây", gz: "Gen Z", en: "English" };
const FLAVOURS = { mt: MT, gz: GZ };
let lang = "en";
export const setLang = (l) => { lang = LANGS[l] ? l : "en"; };
export const getLang = () => lang;
/** Any Vietnamese (for dates, the calendar and speech). */
export const isVi = () => lang !== "en";
/** Value for <html lang>. */
export const htmlLang = (l = lang) => (l === "en" ? "en" : "vi");
/** Locale for dates and times. */
export const locale = () => (isVi() ? "vi-VN" : "en-GB");

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
  const F = FLAVOURS[lang];
  const d = (lang === "en" ? EN : F && s in F ? F : VI)[s];
  const out = typeof d === "function" ? d(vars) : (d ?? s);
  return out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}
/** Has a translation for the current language (used to spot gaps). */
export const hasT = (s) => lang === "en" || s in VI;
