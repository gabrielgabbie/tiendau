// Where records live: always on this phone (localStorage), signed in or not. Nothing is sent to a server.
// - Without an account: under "pl-guest".
// - Signed in: under that account's own key, so two people sharing a phone keep separate records.
//   The account is only who you are (name, email, picture from Google); records never upload.
// Older versions kept signed-in records in Supabase. On sign-in, any still there are copied onto the
// phone and then deleted from the server. A backup file moves records to another phone.
import { supabase } from "./supabase.js";
import { migrateCategory } from "../core/categories.js";
import { t } from "../core/i18n.js";

export const COLS = ["tx", "bills", "events", "people", "meta"];
const TABLE = { tx: "transactions", bills: "bills", events: "events", people: "people", meta: "settings" };

export const S = { tx: {}, bills: {}, events: {}, people: {}, meta: {} };

export const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/** Public sync state the UI reads. */
export const sync = {
  configured: false,
  mode: "loading", // "loading" (starting up) | "none" (sign-in page) | "guest" | "account"
  user: null,
  status: "idle", // "idle" | "error" (couldn't save on this phone)
  error: "",
  loading: false, // bringing down records an older version left on the server
};

// ---------- events for the UI ----------
const listeners = { change: new Set(), status: new Set(), mode: new Set(), guestData: new Set(), recovery: new Set() };
export const on = (ev, fn) => { listeners[ev].add(fn); return () => listeners[ev].delete(fn); };
const emit = (ev, arg) => listeners[ev].forEach((fn) => { try { fn(arg); } catch (e) { console.error(e); } });

// ---------- server rows -> records (only to bring down what older versions uploaded) ----------
const msOf = (s) => (s ? Date.parse(s) : undefined);

function fromRow(col, r) {
  switch (col) {
    case "tx":
      return migrateCategory({ id: r.id, type: r.type, amount: Number(r.amount), category: r.category, note: r.note, date: r.date, billId: r.bill_id || undefined, createdAt: msOf(r.created_at) });
    case "bills":
      return migrateCategory({ ...(r.data || {}), id: r.id, kind: r.kind, title: r.title, date: r.date, category: r.category || undefined, eventId: r.event_id || null, amount: Number(r.amount), createdAt: msOf(r.created_at) });
    case "events":
      return { id: r.id, name: r.name, date: r.date };
    case "people":
      return { id: r.id, name: r.name };
    case "meta":
      return { id: "settings", currency: r.currency, hideDemo: r.hide_demo, ...(r.avatar ? { avatar: r.avatar } : {}) };
  }
}
const keyOf = (col, r) => (col === "meta" ? "settings" : r.id);

// ---------- ids ----------
// The database uses UUIDs. Records from older versions or other sources may not, so they get new
// ids here, with every reference between records updated to match.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A random UUID. crypto.randomUUID only exists on https pages, so build one from random bytes otherwise
 *  (e.g. when testing on a phone over the local network). */
export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80; // version 4, RFC 4122 variant
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function normalizeIds(d) {
  const map = {};
  const fix = (id) => (id == null || id === "me" ? id : UUID.test(id) ? id : (map[id] ||= newId()));
  const out = { people: {}, events: {}, tx: {}, bills: {} };
  Object.values(d.people || {}).forEach((p) => { const o = { ...p, id: fix(p.id) }; out.people[o.id] = o; });
  Object.values(d.events || {}).forEach((e) => { const o = { ...e, id: fix(e.id) }; out.events[o.id] = o; });
  Object.values(d.tx || {}).forEach((t) => { const o = { ...t, id: fix(t.id), billId: t.billId ? fix(t.billId) : undefined }; out.tx[o.id] = o; });
  const rekey = (obj) => (obj ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [fix(k), v])) : obj);
  Object.values(d.bills || {}).forEach((b) => {
    const o = { ...b, id: fix(b.id), eventId: b.eventId ? fix(b.eventId) : null, linkedTx: b.linkedTx ? fix(b.linkedTx) : b.linkedTx,
      paidBy: fix(b.paidBy), shares: rekey(b.shares), paid: rekey(b.paid), people: rekey(b.people), ...(b.billId ? { billId: fix(b.billId) } : {}),
      payers: (b.payers || []).map((x) => ({ ...x, p: fix(x.p) })),
      adjustments: (b.adjustments || []).map((a) => ({ ...a, person: a.person ? fix(a.person) : a.person })) };
    out.bills[o.id] = o;
  });
  return out;
}

// ---------- local storage ----------
const cacheKey = () => (sync.mode === "account" ? `pl-acct-${sync.user.id}` : "pl-guest");
function loadCache(key) {
  const d = LS.get(key, null);
  COLS.forEach((c) => {
    S[c] = (d && d[c]) || {};
    Object.values(S[c]).forEach(migrateCategory);
  });
}
let cacheTimer = 0;
function saveCache() {
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    if (!saveNow()) setStatus("error", t("This phone is out of space, so your records couldn't be saved."));
    else if (sync.status === "error") setStatus("idle");
  }, 150);
}
/** Saves right away; false if the phone refused (storage full or blocked). */
function saveNow() {
  clearTimeout(cacheTimer);
  if (sync.mode !== "guest" && sync.mode !== "account") return false;
  try { localStorage.setItem(cacheKey(), JSON.stringify(S)); return true; } catch { return false; }
}
function resetData() { COLS.forEach((c) => (S[c] = {})); }
if (typeof window !== "undefined") window.addEventListener("pagehide", () => saveNow());

// ---------- writes ----------
export function put(col, obj) {
  S[col][obj.id] = obj;
  saveCache();
  emit("change");
}

export function del(col, id) {
  delete S[col][id];
  saveCache();
  emit("change");
}

// ---------- records left on the server by older versions ----------
async function fetchAll(table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

/** Copies this account's records from Supabase onto the phone, then deletes them from Supabase.
 *  The server copy is only deleted once the phone has saved everything; offline, it tries again next time. */
async function bringDownFromServer(uid) {
  sync.loading = true; emit("status", sync);
  try {
    const results = await Promise.all(COLS.map((c) => fetchAll(TABLE[c])));
    if (sync.user?.id !== uid || !results.some((r) => r.length)) return;
    COLS.forEach((c, i) => results[i].forEach((r) => {
      const id = keyOf(c, r);
      if (!S[c][id]) S[c][id] = fromRow(c, r); // a change already made on this phone wins
    }));
    if (!saveNow()) { setStatus("error", t("This phone is out of space, so your records couldn't be saved.")); return; }
    emit("change");
    for (const table of Object.values(TABLE)) {
      const { error } = await supabase.from(table).delete().eq("user_id", uid);
      if (error) throw error;
    }
  } catch (e) {
    console.warn("Couldn't bring records down from the server; will try again next time", e);
  } finally {
    sync.loading = false; emit("status", sync);
  }
}
function setStatus(s, error = "") { sync.status = s; sync.error = error; emit("status", sync); }

// ---------- modes ----------
function setMode(mode, user = null) {
  sync.mode = mode;
  sync.user = user;
  sync.error = "";
  emit("mode", sync);
}

function guestHasData() {
  const g = LS.get("pl-guest", null);
  return !!g && ["tx", "bills"].some((c) => Object.keys(g[c] || {}).length);
}

async function enterAccount(user) {
  if (sync.mode === "account" && sync.user?.id === user.id) { sync.user = user; emit("mode", sync); return; }
  saveNow();
  setMode("account", user);
  loadCache(cacheKey());
  setStatus("idle");
  emit("change");
  await bringDownFromServer(user.id);
  if (guestHasData()) emit("guestData", countGuest());
}

function enterGuest() {
  saveNow();
  setMode("guest");
  loadCache("pl-guest");
  setStatus("idle");
  emit("change");
}

/** Start up: restore the session if there is one, otherwise open the app without an account (sign-in is in the header). */
export async function init() {
  sync.configured = !!supabase;
  if (!supabase) { enterGuest(); return; }
  supabase.auth.onAuthStateChange((event, session) => {
    // Supabase recommends not awaiting other Supabase calls inside this callback.
    setTimeout(() => {
      if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED")) enterAccount(session.user);
      if (event === "PASSWORD_RECOVERY") emit("recovery");
      if (event === "SIGNED_OUT" && sync.mode === "account") enterGuest();
    }, 0);
  });
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) await enterAccount(data.session.user);
  else enterGuest();
}

export const continueAsGuest = () => enterGuest();
export const showSignIn = () => { saveNow(); resetData(); setMode("none"); };

/** Signing out keeps this account's records on the phone; they're back when you sign in again. */
export async function signOut() {
  if (!supabase) return;
  saveNow();
  await supabase.auth.signOut().catch(() => {});
  enterGuest();
}

// ---------- guest records → account ----------
export function countGuest() {
  const g = LS.get("pl-guest", {});
  return { tx: Object.keys(g.tx || {}).length, bills: Object.keys(g.bills || {}).length };
}
export function moveGuestDataToAccount() {
  const raw = LS.get("pl-guest", null);
  if (!raw || sync.mode !== "account") return 0;
  const g = normalizeIds(raw);
  let n = 0;
  ["people", "events", "tx", "bills"].forEach((c) => Object.values(g[c] || {}).forEach((o) => { S[c][o.id] = migrateCategory(o); n++; }));
  if (!saveNow()) throw new Error(t("This phone is out of space, so your records couldn't be saved."));
  LS.del("pl-guest");
  emit("change");
  return n;
}
export const forgetGuestData = () => LS.del("pl-guest");

// ---------- account actions ----------
export function deleteAllData() {
  ["tx", "bills", "events", "people"].forEach((c) => (S[c] = {}));
  saveNow(); emit("change");
}

/** Deletes the account (its sign-in details on the server) and its records on this phone. */
export async function deleteAccount() {
  const uid = sync.user.id;
  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw error;
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  resetData();
  enterGuest();
  LS.del(`pl-acct-${uid}`);
}

// ---------- backup ----------
// Records live only on this phone, so a backup file is the way to keep them safe or move to a new phone.
// `at` is the last backup (or when we started counting); after 30 days without one, a reminder shows.
const DAY = 864e5, REMIND_AFTER = 30 * DAY, SNOOZE = 7 * DAY;
const backupKey = () => `pl-backup-${sync.mode === "account" ? sync.user.id : "guest"}`;
function backupInfo() {
  let b = LS.get(backupKey(), null);
  if (!b) { b = { at: Date.now() }; LS.set(backupKey(), b); }
  return b;
}
/** True when there are records and no backup (or "later") in 30 days. */
export function backupDue(now = Date.now()) {
  if (sync.mode !== "guest" && sync.mode !== "account") return false;
  if (!Object.keys(S.tx).length && !Object.keys(S.bills).length) return false;
  const b = backupInfo();
  return now - b.at > REMIND_AFTER && !(b.snoozed > now - SNOOZE);
}
export function snoozeBackup() { LS.set(backupKey(), { ...backupInfo(), snoozed: Date.now() }); emit("change"); }

export function exportData() {
  LS.set(backupKey(), { at: Date.now() });
  return {
    app: "pocket-ledger", version: 1, exportedAt: new Date().toISOString(),
    data: { tx: S.tx, bills: S.bills, events: S.events, people: S.people, settings: S.meta.settings || null },
  };
}

export function importData(json) {
  const d = json && json.app === "pocket-ledger" && json.data;
  if (!d) throw new Error(t("This file isn't a Tiền Đâu backup."));
  const counts = { tx: 0, bills: 0, events: 0, people: 0 };
  const clean = normalizeIds(d);
  ["people", "events", "tx", "bills"].forEach((c) => {
    Object.values(clean[c] || {}).forEach((o) => {
      if (!o || typeof o !== "object" || !o.id) return;
      put(c, migrateCategory(o)); counts[c]++;
    });
  });
  if (d.settings) put("meta", { ...d.settings, id: "settings" });
  return counts;
}
