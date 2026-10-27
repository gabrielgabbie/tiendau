// App logic the screens share: example data, people & events, turning parsed chat into records,
// ledger filters and periods. No DOM here; components read these and re-render on store events.
import {
  EXP_CATS, INC_CATS, guessCat, round, pad, ymd, today, fmtLong, money,
  isNum, finalizeBill, localParse, t, setLang, locale, billRecords,
} from "../core/index.js"; // relative paths so tests can load this module in Node
import { S, LS, put, del, sync, on } from "../data/store.js";

export const uid = () => crypto.randomUUID();

// ---------- UI state that outlives a render (persisted where the old app persisted it) ----------
// the app always opens on Log, the main action
export const ui = { tab: "chat", event: "all", L: Object.assign({ period: "month", day: today(), month: today().slice(0, 7), year: new Date().getFullYear(), from: "", to: "", cat: "all", sort: "date-desc" }, LS.get("pl-ledger", {})) };
(() => { const L = ui.L; if (!Array.isArray(L.cats)) { L.cats = []; L.type = "all";
  if (L.cat === "t:expense") L.type = "expense"; else if (L.cat === "t:income") L.type = "income"; else if (L.cat && L.cat !== "all") L.cats = [L.cat === "Food" ? "Food & Drinks" : L.cat]; } delete L.cat;
  L.cats = L.cats.map((c) => (c === "Food" ? "Food & Drinks" : c)); if (!L.type) L.type = "all"; })();
export const saveL = () => LS.set("pl-ledger", { period: ui.L.period, type: ui.L.type, cats: ui.L.cats, sort: ui.L.sort, from: ui.L.from, to: ui.L.to });
// a bill reading that was cut short (app closed mid-read) shows as interrupted, not stuck "reading…"
export let chatLog = LS.get("pl-chat", []).map((m) => (m.pending ? { role: "bot", text: t("Reading this bill was interrupted. Send the photo again.") } : m));
export function clearChat() { chatLog = []; LS.set("pl-chat", []); }

// Anything that should repaint the app: store events plus local UI changes (bump).
let version = 0;
const subs = new Set();
export function bump() { version++; subs.forEach((f) => f()); }
export const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const getVersion = () => version;
["change", "mode", "status"].forEach((ev) => on(ev, bump));

// ---------- device preferences: language (Vietnamese by default) ----------
// The app is light-only for now; the dark tokens stay in styles.css, and `theme` is the one place to bring it back.
export const prefs = { lang: LS.get("pl-lang", "vi"), theme: "light" };
setLang(prefs.lang);
export function setLanguage(l) { prefs.lang = l; LS.set("pl-lang", l); setLang(l); document.documentElement.lang = l; bump(); }
export function applyTheme() {
  const dark = prefs.theme === "dark", el = document.documentElement;
  el.classList.toggle("dark", dark); el.style.colorScheme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0F1412" : "#EEF1EC");
}

export const settings = () => Object.assign({ id: "settings", currency: "VND", hideDemo: false }, S.meta.settings || {});

// ---------- demo data (shown only when empty, never saved) ----------
function demo() {
  const d = new Date(); const day = (k) => { const x = new Date(d); x.setDate(x.getDate() - k); return ymd(x); };
  const tx = {}, bills = {}, events = {}, people = {};
  const T = (id, type, amount, category, note, k) => (tx[id] = { id, type, amount, category, note, date: day(k), example: true });
  T("d1", "income", 25000000, "Salary", t("October salary"), 20);
  T("d2", "expense", 6500000, "Housing", t("Rent"), 19);
  T("d3", "expense", 55000, "Food & Drinks", t("Phở bò"), 0);
  T("d4", "expense", 32000, "Transport", t("Grab to office"), 0);
  T("d5", "expense", 890000, "Bills", t("Electricity"), 3);
  T("d6", "expense", 420000, "Shopping", t("Running socks"), 5);
  T("d7", "expense", 300000, "Food & Drinks", t("Groceries delivery"), 1);
  T("d8", "income", 3000000, "Freelance", t("Logo project"), 8);
  T("d9", "expense", 180000, "Entertainment", t("Cinema"), 9);
  people.an = { id: "an", name: "An" }; people.binh = { id: "binh", name: "Bình" }; people.chi = { id: "chi", name: "Chi" };
  events.dl = { id: "dl", name: t("Đà Lạt trip"), date: day(6) }; events.hp = { id: "hp", name: t("House expenses"), date: day(25) };
  const mk = (id, o) => { const b = Object.assign({ id, kind: "bill", adjustments: [], category: "Food & Drinks" }, o); b.adjustments.forEach((a, i) => (a.id = id + i)); finalizeBill(b); bills[id] = b; };
  mk("b1", { title: t("Villa 2 nights"), subtotal: 3300000, mode: "equal", people: { me: {}, an: {}, binh: {} }, adjustments: [{ label: t("Cleaning fee"), type: "fee", value: 300000, unit: "amount", alloc: "equal" }], payers: [{ p: "me", amount: null }], eventId: "dl", category: "Travel", date: day(6) });
  mk("b2", { title: t("BBQ dinner"), subtotal: 1100000, mode: "items", people: { me: { item: 350000 }, an: { item: null }, binh: { item: null } }, adjustments: [{ label: t("Service charge"), type: "fee", value: 5, unit: "percent", alloc: "proportional" }, { label: t("VAT"), type: "fee", value: 8, unit: "percent", alloc: "proportional" }, { label: t("Voucher"), type: "discount", value: 50000, unit: "amount", alloc: "proportional" }], payers: [{ p: "an", amount: null }], eventId: "dl", date: day(2) });
  mk("b3", { title: t("Internet"), subtotal: 300000, mode: "equal", people: { me: {}, chi: {} }, payers: [{ p: "chi", amount: null }], eventId: "hp", category: "Bills", date: day(4) });
  mk("b4", { title: t("Groceries delivery"), subtotal: 640000, mode: "equal", people: { me: {}, chi: {} }, adjustments: [{ label: t("Shipping"), type: "fee", value: 25000, unit: "amount", alloc: "equal" }, { label: t("Promo code"), type: "discount", value: 10, unit: "percent", alloc: "proportional" }], payers: [{ p: "me", amount: 300000 }, { p: "chi", amount: null }], eventId: "hp", date: day(1) });
  return { tx, bills, events, people, demo: true };
}
const isEmpty = () => !Object.keys(S.tx).length && !Object.keys(S.bills).length;
export const data = () => (isEmpty() && !settings().hideDemo ? demo() : { tx: S.tx, bills: S.bills, events: S.events, people: S.people, demo: false });

// ---------- people & events ----------
export function pname(id, D = data()) { if (id === "me") return t("You"); return D.people[id]?.name || t("Someone"); }
export function findOrCreatePerson(name) {
  const n = String(name || "").trim(); if (!n) return null;
  if (/^(me|i|myself|you|tôi|mình|em|anh)$/i.test(n)) return "me";
  const hit = Object.values(S.people).find((p) => p.name.toLowerCase() === n.toLowerCase());
  if (hit) return hit.id;
  const p = { id: uid(), name: n.charAt(0).toUpperCase() + n.slice(1) }; put("people", p); return p.id;
}
export function findOrCreateEvent(name) {
  const n = String(name || "").replace(/^#/, "").replace(/[-_]/g, " ").trim(); if (!n) return null;
  const hit = Object.values(S.events).find((e) => e.name.toLowerCase() === n.toLowerCase());
  if (hit) return hit.id;
  const e = { id: uid(), name: n.charAt(0).toUpperCase() + n.slice(1), date: today() }; put("events", e); return e.id;
}

// The ledger follows my cash: a shared bill adds what I actually paid (not my share),
// and a settle-up adds money coming back to me (income) or going out from me (expense).
// Each bill keeps the id of its ledger record in `linkedTx`, so edits and deletes stay in step.
function link(b, rec) {
  if (rec) {
    const r = Object.assign({ id: b.linkedTx || uid() }, S.tx[b.linkedTx] || {}, rec, { date: b.date, billId: b.id, createdAt: S.tx[b.linkedTx]?.createdAt || Date.now() });
    b.linkedTx = r.id; put("tx", r);
  } else if (b.linkedTx) {
    if (S.tx[b.linkedTx]) del("tx", b.linkedTx);
    b.linkedTx = null;
  }
}

/** Saves a shared bill; with `log`, what I paid for it goes into my ledger as an expense. */
export function saveBill(b, { log = true } = {}) {
  const paid = b.kind === "bill" ? round(b.paid?.me || 0) : 0;
  link(b, b.kind === "bill" && log && paid > 0 ? { type: "expense", amount: paid, category: b.category || "Food & Drinks", note: b.title } : null);
  put("bills", b); return b;
}

/** Saves a settle-up payment; if I'm the one paying or being paid, it goes into my ledger. */
export function saveSettle(b) {
  const to = Object.keys(b.shares)[0];
  link(b, b.paidBy === "me" ? { type: "expense", amount: b.amount, category: "Other", note: t("Paid back {name}", { name: pname(to) }) }
    : to === "me" ? { type: "income", amount: b.amount, category: "Refund", note: t("{name} paid you back", { name: pname(b.paidBy) }) }
    : null);
  put("bills", b); return b;
}

export function deleteBill(id) { const b = S.bills[id]; if (!b) return; if (b.linkedTx && S.tx[b.linkedTx]) del("tx", b.linkedTx); del("bills", id); }

function applyItems(items, { categoryHint } = {}) {
  const made = [], notes = [];
  for (const it of items || []) {
    const amount = round(Number(it.amount)); if (it.type !== "bill" && !(amount > 0)) continue;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(it.date || "") ? it.date : today();
    if (it.type === "expense" || it.type === "income") {
      const cats = it.type === "income" ? INC_CATS : EXP_CATS;
      let category = cats.includes(it.category) ? it.category : guessCat((it.note || "") + " " + (it.category || ""), it.type === "income");
      // a receipt's items can tell the category when the shop name alone can't
      if (category === "Other" && it.type === "expense" && categoryHint && cats.includes(categoryHint)) category = categoryHint;
      const rec = { id: uid(), type: it.type, amount, category, note: String(it.note || (it.category && t(it.category)) || t("Entry")).slice(0, 80), date, createdAt: Date.now() };
      put("tx", rec); made.push({ col: "tx", id: rec.id });
    } else if (it.type === "bill") {
      const sub = round(Number(it.subtotal ?? it.amount)); if (!(sub > 0)) continue;
      const people = {};
      (it.people || it.participants || []).forEach((x) => { const o = typeof x === "string" ? { name: x } : (x || {}); const pid = findOrCreatePerson(o.name); if (pid) people[pid] = { item: isNum(o.item) ? round(Number(o.item)) : null, weight: isNum(o.weight) ? Number(o.weight) : 1 }; });
      if (it.shares && typeof it.shares === "object") Object.entries(it.shares).forEach(([n, a]) => { const pid = findOrCreatePerson(n); if (pid) people[pid] = { item: round(Number(a) || 0), weight: 1 }; });
      if (!Object.keys(people).length) people.me = { item: null, weight: 1 };
      const mode = ["equal", "items", "shares"].includes(it.mode) ? it.mode : (Object.values(people).some((x) => isNum(x.item)) ? "items" : "equal");
      const adjustments = (Array.isArray(it.adjustments) ? it.adjustments : []).map((a) => { const ad = { id: uid(), label: String(a.label || (a.type === "discount" ? t("Discount") : t("Fee"))).slice(0, 40), type: a.type === "discount" ? "discount" : "fee", value: Math.abs(Number(a.value)) || 0, unit: a.unit === "percent" ? "percent" : "amount", alloc: ["proportional", "equal", "person"].includes(a.alloc) ? a.alloc : "proportional", person: null };
        if (ad.alloc === "person") { ad.person = findOrCreatePerson(a.person); if (!ad.person || !people[ad.person]) ad.alloc = "equal"; } return ad; }).filter((a) => a.value > 0);
      const payers = (Array.isArray(it.payers) && it.payers.length ? it.payers : [{ name: it.paidBy || "me", amount: null }]).map((x) => ({ p: findOrCreatePerson(typeof x === "string" ? x : (x.name || "me")) || "me", amount: isNum(x.amount) ? round(Number(x.amount)) : null }));
      const b = { id: uid(), kind: "bill", title: String(it.title || t("Shared bill")).slice(0, 80), subtotal: sub, mode, people, adjustments, payers, eventId: it.event ? findOrCreateEvent(it.event) : null, category: EXP_CATS.includes(it.category) ? it.category : guessCat(it.title || "", false), date, createdAt: Date.now() };
      let r = finalizeBill(b);
      if (!r.ok) { b.mode = "equal"; b.payers = [{ p: payers[0].p, amount: null }]; r = finalizeBill(b); if (r.ok) notes.push(t("I split “{title}” equally because the amounts didn't add up. Tap Edit to adjust.", { title: b.title })); }
      if (!r.ok) { notes.push(t("Couldn't log “{title}”: {err}", { title: b.title, err: r.errs[0] })); continue; }
      saveBill(b); made.push({ col: "bills", id: b.id });
    } else if (it.type === "settle") {
      const from = findOrCreatePerson(it.from), to = findOrCreatePerson(it.to); if (!from || !to || from === to) continue;
      const b = { id: uid(), kind: "settle", title: t("Settle up"), amount, paidBy: from, shares: { [to]: amount }, eventId: it.event ? findOrCreateEvent(it.event) : null, date, createdAt: Date.now() };
      saveSettle(b); made.push({ col: "bills", id: b.id });
    }
  }
  return { made, notes };
}
/** Quick add. `categoryHint` (from a scanned receipt) fills in a category the text alone can't tell. */
export function send(text, { categoryHint } = {}) {
  text = text.trim(); if (!text) return;
  const res = localParse(text);
  const { made, notes } = applyItems(res.items, { categoryHint });
  let reply = res.reply || (made.length ? t("Added {n} records.", { n: made.length }) : t("I couldn't find anything to add."));
  if (notes.length) reply += "\n" + notes.join("\n");
  chatLog.push({ role: "me", text }, { role: "bot", text: reply, made });
  saveChat(); bump();
}

// ---------- bills sent as photos ----------
const saveChat = () => { chatLog = chatLog.slice(-80); LS.set("pl-chat", chatLog.map(({ progress, ...m }) => m)); };

/** Adds the user's photo message (and an optional note) plus a "reading…" reply; returns the reply's id. */
export function startBill({ thumb, text }) {
  const id = uid();
  chatLog.push({ role: "me", text: text.trim(), image: thumb }, { role: "bot", id, pending: true, progress: 0 });
  saveChat(); bump();
  return id;
}
export function billProgress(id, progress) {
  const m = chatLog.find((x) => x.id === id);
  if (m && m.pending) { m.progress = progress; bump(); }
}

/** Turns a read bill into records and replaces the "reading…" reply with the result.
 *  Without a note: one record per item (scaled so they add up to what was paid), each with its category.
 *  With a note that has no amount ("dinner with An, Bình"): the note describes the whole bill, with the bill's total. */
export function finishBill(id, bill, { text = "" } = {}) {
  const at = chatLog.findIndex((x) => x.id === id);
  if (at < 0) return;
  const date = bill.date && bill.date <= today() ? bill.date : today();
  const shopCat = guessCat(bill.shop || "", false);
  let items = [];
  if (text.trim() && !/\d/.test(text) && bill.total > 0) {
    items = localParse(`${text.trim()} ${bill.total}`).items.map((it) => ({ ...it, date }));
  } else {
    items = billRecords(bill, t("Bill")).map((x) => {
      let category = EXP_CATS.includes(x.category) ? x.category : guessCat(x.name, false);
      if (category === "Other") category = EXP_CATS.includes(bill.category) && bill.category !== "Other" ? bill.category : shopCat;
      return { type: "expense", amount: x.amount, category, note: x.name, date };
    });
  }
  const { made, notes } = applyItems(items);
  const total = made.reduce((a, r) => a + ((r.col === "tx" ? S.tx[r.id]?.amount : S.bills[r.id]?.amount) || 0), 0);
  let reply = made.length
    ? t(bill.shop ? "Added {n} records from {shop}, {amt} in total." : "Added {n} records from the bill, {amt} in total.", { n: made.length, shop: bill.shop, amt: money(total) })
    : t("I couldn't find any prices in this photo. Type the amount and I'll add it.");
  if (notes.length) reply += "\n" + notes.join("\n");
  chatLog[at] = { role: "bot", text: reply, made, via: bill.source };
  saveChat(); bump();
}
export function failBill(id, message) {
  const at = chatLog.findIndex((x) => x.id === id);
  if (at < 0) return;
  chatLog[at] = { role: "bot", text: message };
  saveChat(); bump();
}

export function billMeta(b, D) {
  const payers = Object.keys(b.paid || { [b.paidBy]: b.amount }); const n = Object.keys(b.shares || {}).length;
  const who = payers.length > 2 ? t("{n} people paid", { n: payers.length }) : t("{names} paid", { names: payers.map((p) => pname(p, D)).join(" & ") });
  const extra = [b.fees ? t("+{amt} fees", { amt: money(b.fees) }) : "", b.disc ? t("−{amt} off", { amt: money(b.disc) }) : ""].filter(Boolean).join(", ");
  return `${t("{n} people", { n })} · ${who}${extra ? " · " + extra : ""}`;
}

// ---------- ledger period & filter ----------
export const SORTS = { "date-desc": "Newest first", "date-asc": "Oldest first", "amt-desc": "Largest amount", "amt-asc": "Smallest amount" };
export function periodRange() {
  const L = ui.L;
  if (L.period === "day") return [L.day, L.day];
  if (L.period === "month") { const [y, m] = L.month.split("-").map(Number); return [`${L.month}-01`, ymd(new Date(y, m, 0))]; }
  if (L.period === "year") return [`${L.year}-01-01`, `${L.year}-12-31`];
  const f = L.from || "0000-01-01", t = L.to || "9999-12-31"; return f <= t ? [f, t] : [t, f];
}
export function periodLabel() {
  const L = ui.L;
  if (L.period === "day") { const d = new Date(L.day + "T00:00"); return d.toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
  if (L.period === "month") { const [y, m] = L.month.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: "long", year: "numeric" }); }
  if (L.period === "year") return String(L.year);
  if (!L.from && !L.to) return t("All time");
  const [f, to] = periodRange();
  if (L.from && L.to && f === to) return fmtLong(f);
  return `${L.from ? fmtLong(f) : t("Start")} – ${L.to ? fmtLong(to) : t("Today")}`;
}
export function stepPeriod(n) {
  const L = ui.L;
  if (L.period === "day") { const d = new Date(L.day + "T00:00"); d.setDate(d.getDate() + n); L.day = ymd(d); }
  else if (L.period === "month") { const [y, m] = L.month.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); L.month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
  else if (L.period === "year") L.year = Number(L.year) + n;
  bump();
}
export function filterLabel() {
  const L = ui.L; const type = { all: "", expense: t("Expenses"), income: t("Income") }[L.type];
  if (!L.cats.length) return type || t("All categories");
  if (L.cats.length === 1) return t(L.cats[0]);
  return t("{n} categories", { n: L.cats.length });
}
export const filterOn = () => ui.L.type !== "all" || ui.L.cats.length > 0;
export function clearFilter() { ui.L.type = "all"; ui.L.cats = []; saveL(); bump(); }
export function spentBy(keyLen) { const out = {}; Object.values(data().tx).forEach((t) => { if (t.type === "income" || !t.date) return; const k = t.date.slice(0, keyLen); out[k] = (out[k] || 0) + t.amount; }); return out; }

// ---------- account ----------
export function who() { const u = sync.user, m = u.user_metadata || {}; const name = m.full_name || m.name || ""; const email = u.email || ""; return { name, email, initial: (name || email || "?")[0].toUpperCase() }; }
export const providerLabel = (p) => ({ google: "Google", apple: "Apple" })[p] || t("email");
export function syncText() {
  const n = sync.pending, ch = t("{n} changes", { n });
  if (sync.loading && sync.status !== "offline") return t("Loading your records…");
  if (sync.status === "syncing") return t("Saving {ch}…", { ch });
  if (sync.status === "offline") return n ? t("You're offline. {ch} will sync when you're back online.", { ch }) : t("You're offline. New changes will sync when you're back online.");
  if (sync.status === "error") return t("A change couldn't be saved: {err}", { err: sync.error });
  if (sync.lastSynced) return t("All changes saved · {time}", { time: new Date(sync.lastSynced).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) });
  return t("Connected");
}
