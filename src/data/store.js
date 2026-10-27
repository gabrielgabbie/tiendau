// Where records live.
// - Guest mode: only in this browser (localStorage).
// - Account mode: in Supabase, with a local copy so the app opens instantly and works offline.
//   Changes made offline wait in a queue and are sent when the connection is back.
//   Changes made on other devices arrive live through Supabase Realtime.
import { supabase } from "./supabase.js";
import { migrateCategory } from "../core/categories.js";
import { t } from "../core/i18n.js";

export const COLS = ["tx", "bills", "events", "people", "meta"];
const TABLE = { tx: "transactions", bills: "bills", events: "events", people: "people", meta: "settings" };
const COL_OF = Object.fromEntries(Object.entries(TABLE).map(([c, t]) => [t, c]));

export const S = { tx: {}, bills: {}, events: {}, people: {}, meta: {} };

export const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/** Public sync state the UI reads. */
export const sync = {
  configured: false,
  mode: "none", // "none" (show sign-in) | "guest" | "account"
  user: null,
  status: "idle", // "idle" | "syncing" | "saved" | "offline" | "error"
  error: "",
  pending: 0,
  lastSynced: null,
  loading: false,
};

// ---------- events for the UI ----------
const listeners = { change: new Set(), status: new Set(), mode: new Set(), guestData: new Set(), recovery: new Set() };
export const on = (ev, fn) => { listeners[ev].add(fn); return () => listeners[ev].delete(fn); };
const emit = (ev, arg) => listeners[ev].forEach((fn) => { try { fn(arg); } catch (e) { console.error(e); } });

// ---------- rows <-> records ----------
const iso = (ms) => (ms ? new Date(ms).toISOString() : undefined);
const msOf = (s) => (s ? Date.parse(s) : undefined);

function toRow(col, o, uid) {
  switch (col) {
    case "tx":
      return { id: o.id, user_id: uid, type: o.type, amount: o.amount, category: o.category, note: o.note || "", date: o.date, bill_id: o.billId || null, created_at: iso(o.createdAt) };
    case "bills": {
      const { id, kind, title, date, category, eventId, amount, createdAt, ...rest } = o;
      return { id, user_id: uid, kind, title: title || "", date, category: category || null, event_id: eventId || null, amount, data: rest, created_at: iso(createdAt) };
    }
    case "events":
      return { id: o.id, user_id: uid, name: o.name, date: o.date || null };
    case "people":
      return { id: o.id, user_id: uid, name: o.name };
    case "meta":
      return { user_id: uid, currency: o.currency || "VND", hide_demo: !!o.hideDemo };
  }
}

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
      return { id: "settings", currency: r.currency, hideDemo: r.hide_demo };
  }
}
const keyOf = (col, r) => (col === "meta" ? "settings" : r.id);

// ---------- ids ----------
// The database uses UUIDs. Records from older versions or other sources may not, so they get new
// ids here, with every reference between records updated to match.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const newId = () => crypto.randomUUID();
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

// ---------- local cache ----------
const cacheKey = () => (sync.mode === "account" ? `pl-acct-${sync.user.id}` : "pl-guest");
const queueKey = () => `pl-queue-${sync.user.id}`;
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
  cacheTimer = setTimeout(() => { if (sync.mode !== "none") LS.set(cacheKey(), S); }, 150);
}
function resetData() { COLS.forEach((c) => (S[c] = {})); }

// ---------- writes ----------
let queue = [];
function saveQueue() { if (sync.mode === "account") LS.set(queueKey(), queue); sync.pending = queue.length; }

function enqueue(op) {
  // only the latest change to a record matters
  queue = queue.filter((q) => !(q.col === op.col && q.id === op.id));
  queue.push(op);
  saveQueue();
  setStatus(navigator.onLine === false ? "offline" : "syncing");
  flush();
}

export function put(col, obj) {
  S[col][obj.id] = obj;
  saveCache();
  if (sync.mode === "account") enqueue({ op: "put", col, id: obj.id, obj: JSON.parse(JSON.stringify(obj)) });
  emit("change");
}

export function del(col, id) {
  delete S[col][id];
  saveCache();
  if (sync.mode === "account") enqueue({ op: "del", col, id });
  emit("change");
}

const isNetworkError = (e) =>
  navigator.onLine === false || !e || /fetch|network|timeout|load failed/i.test(e.message || "") || e.status >= 500 || e.code === "PGRST301";

let flushing = false;
async function flush() {
  if (flushing || sync.mode !== "account" || !queue.length) return;
  flushing = true;
  setStatus("syncing");
  const uid = sync.user.id;
  while (queue.length && sync.mode === "account" && sync.user?.id === uid) {
    const op = queue[0];
    let error = null;
    try {
      const t = supabase.from(TABLE[op.col]);
      ({ error } = op.op === "put" ? await t.upsert(toRow(op.col, op.obj, uid)) : await t.delete().eq("id", op.id));
    } catch (e) {
      error = e;
    }
    if (error) {
      if (isNetworkError(error)) { setStatus("offline"); break; }
      // The server refused this change (e.g. invalid data). Drop it so the rest can sync.
      console.error("Change refused", op, error);
      sync.error = error.message || "A change couldn't be saved.";
      queue.shift(); saveQueue();
      setStatus("error");
      continue;
    }
    queue.shift();
    saveQueue();
  }
  flushing = false;
  if (!queue.length && sync.mode === "account" && sync.status !== "error") {
    sync.lastSynced = Date.now();
    setStatus("saved");
  }
}
function setStatus(s) { sync.status = s; sync.pending = queue.length; emit("status", sync); }

if (typeof window !== "undefined") {
  window.addEventListener("online", () => flush());
  setInterval(() => { if (queue.length) flush(); }, 20000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && sync.mode === "account" && Date.now() - lastLoad > 60000) loadAll();
  });
}

// ---------- reads ----------
let lastLoad = 0;
async function fetchAll(table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

async function loadAll() {
  if (sync.mode !== "account") return;
  const uid = sync.user.id;
  sync.loading = true; emit("status", sync);
  try {
    const results = await Promise.all(COLS.map((c) => fetchAll(TABLE[c])));
    if (sync.user?.id !== uid) return;
    COLS.forEach((c, i) => {
      const m = {};
      results[i].forEach((r) => (m[keyOf(c, r)] = fromRow(c, r)));
      S[c] = m;
    });
    // re-apply changes that haven't reached the server yet
    queue.forEach((op) => { if (op.op === "put") S[op.col][op.id] = op.obj; else delete S[op.col][op.id]; });
    lastLoad = Date.now();
    saveCache();
    emit("change");
    if (!queue.length) { sync.lastSynced = Date.now(); setStatus("saved"); }
  } catch (e) {
    console.warn("Load failed", e);
    setStatus(isNetworkError(e) ? "offline" : "error");
  } finally {
    sync.loading = false; emit("status", sync);
  }
}

let channel = null;
function subscribe() {
  unsubscribe();
  const uid = sync.user.id;
  channel = supabase.channel(`pl-${uid}`);
  for (const table of Object.values(TABLE)) {
    const apply = (payload) => {
      const col = COL_OF[payload.table];
      if (!col || sync.user?.id !== uid) return;
      const row = payload.eventType === "DELETE" ? payload.old : payload.new;
      const id = keyOf(col, row);
      if (!id || queue.some((q) => q.col === col && q.id === id)) return; // a newer local change is on its way
      if (payload.eventType === "DELETE") { if (!S[col][id]) return; delete S[col][id]; }
      else S[col][id] = fromRow(col, row);
      saveCache();
      emit("change");
    };
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table, filter: `user_id=eq.${uid}` }, apply);
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table, filter: `user_id=eq.${uid}` }, apply);
    // Delete events can't be filtered by user; they only carry the id, and unknown ids are ignored.
    channel.on("postgres_changes", { event: "DELETE", schema: "public", table }, apply);
  }
  channel.subscribe();
}
function unsubscribe() { if (channel) { supabase.removeChannel(channel); channel = null; } }

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
  unsubscribe();
  setMode("account", user);
  loadCache(cacheKey());
  queue = LS.get(queueKey(), []);
  sync.pending = queue.length;
  emit("change");
  subscribe();
  await loadAll();
  flush();
  if (guestHasData()) emit("guestData", countGuest());
}

function enterGuest() {
  unsubscribe();
  setMode("guest");
  LS.set("pl-guest-chosen", true);
  loadCache("pl-guest");
  queue = []; sync.pending = 0;
  setStatus("idle");
  emit("change");
}

/** Start up: restore the session if there is one, otherwise show sign-in (or guest mode if chosen before). */
export async function init() {
  sync.configured = !!supabase;
  if (!supabase) { enterGuest(); return; }
  supabase.auth.onAuthStateChange((event, session) => {
    // Supabase recommends not awaiting other Supabase calls inside this callback.
    setTimeout(() => {
      if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED")) enterAccount(session.user);
      if (event === "PASSWORD_RECOVERY") emit("recovery");
      if (event === "SIGNED_OUT" && sync.mode === "account") leaveAccount();
    }, 0);
  });
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) await enterAccount(data.session.user);
  else if (LS.get("pl-guest-chosen", false)) enterGuest();
  else setMode("none");
}

export const continueAsGuest = () => enterGuest();
export const showSignIn = () => { unsubscribe(); resetData(); setMode("none"); };

function leaveAccount() {
  const uid = sync.user?.id;
  unsubscribe();
  if (uid) { LS.del(`pl-acct-${uid}`); LS.del(`pl-queue-${uid}`); } // don't leave someone's records on a shared phone
  queue = []; resetData();
  LS.del("pl-guest-chosen");
  setMode("none");
  emit("change");
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut().catch(() => {});
  leaveAccount();
}

export const unsyncedCount = () => queue.length;

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
  ["people", "events", "tx", "bills"].forEach((c) => Object.values(g[c] || {}).forEach((o) => { put(c, migrateCategory(o)); n++; }));
  LS.del("pl-guest");
  return n;
}
export const forgetGuestData = () => LS.del("pl-guest");

// ---------- account actions ----------
export async function deleteAllData() {
  const uid = sync.user.id;
  for (const t of ["transactions", "bills", "events", "people"]) {
    const { error } = await supabase.from(t).delete().eq("user_id", uid);
    if (error) throw error;
  }
  queue = queue.filter((q) => q.col === "meta"); saveQueue();
  ["tx", "bills", "events", "people"].forEach((c) => (S[c] = {}));
  saveCache(); emit("change");
}

export async function deleteAccount() {
  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw error;
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  leaveAccount();
}

// ---------- backup ----------
export function exportData() {
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
