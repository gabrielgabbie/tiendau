// Tests where records live (always on the phone) against an in-memory stand-in for Supabase.
import { test } from "node:test";
import assert from "node:assert/strict";

// --- browser bits the store expects ---
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

// --- fake Supabase ---
function fakeSupabase(user) {
  const db = { transactions: [], bills: [], events: [], people: [], settings: [] };
  const handlers = [];
  const f = {
    db, offline: false, calls: [],
    auth: {
      getSession: async () => ({ data: { session: user ? { user } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
    },
    channel: () => ({ on(type, filter, fn) { handlers.push({ filter, fn }); return this; }, subscribe() { return this; } }),
    removeChannel() {},
    rpc: async () => ({ error: null }),
    from(table) {
      const net = () => (f.offline ? { error: { message: "TypeError: Failed to fetch" } } : null);
      return {
        select: () => ({ range: async (a, b) => net() || { data: db[table].slice(a, b + 1), error: null } }),
        upsert: async (row) => {
          f.calls.push(["upsert", table, row.id || row.user_id]);
          const e = net(); if (e) return e;
          const key = table === "settings" ? "user_id" : "id";
          const i = db[table].findIndex((r) => r[key] === row[key]);
          if (i >= 0) db[table][i] = { ...db[table][i], ...row }; else db[table].push({ ...row, created_at: new Date().toISOString() });
          return { error: null };
        },
        delete: () => ({
          eq: async (col, v) => { f.calls.push(["delete", table, v]); const e = net(); if (e) return e; db[table] = db[table].filter((r) => r[col] !== v); return { error: null }; },
        }),
      };
    },
    // simulate a change made on another device
    remote(eventType, table, row) {
      handlers.filter((h) => h.filter.table === table && h.filter.event === eventType).forEach((h) => h.fn({ eventType, table, new: row, old: row }));
    },
  };
  return f;
}

const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const user = { id: "11111111-1111-4111-8111-111111111111", email: "me@example.com", app_metadata: { provider: "google" } };

const { useClient } = await import("../src/data/supabase.js");
const store = await import("../src/data/store.js");
const fake = fakeSupabase(user);
// the server already has one record from another device
fake.db.transactions.push({ id: "aaaaaaaa-0000-4000-8000-000000000001", user_id: user.id, type: "expense", amount: "55000.00", category: "Food", note: "Phở", date: "2026-10-20", bill_id: null, created_at: "2026-10-20T01:00:00Z" });
useClient(fake);

test("on sign-in, records an older version uploaded come down to the phone and leave the server", async () => {
  await store.init();
  assert.equal(store.sync.mode, "account");
  const t = store.S.tx["aaaaaaaa-0000-4000-8000-000000000001"];
  assert.equal(t.amount, 55000);
  assert.equal(t.category, "Food & Drinks", "old category names are migrated");
  assert.ok(JSON.parse(localStorage.getItem(`pl-acct-${user.id}`)).tx[t.id], "saved on the phone");
  assert.equal(fake.db.transactions.length, 0, "deleted from the server");
});

test("new records stay on the phone and never reach the server", async () => {
  const id = crypto.randomUUID();
  store.put("tx", { id, type: "expense", amount: 32000, category: "Transport", note: "Grab", date: "2026-10-25", createdAt: Date.now() });
  store.put("bills", { id: crypto.randomUUID(), kind: "bill", title: "Lẩu", date: "2026-10-25", amount: 900000, shares: { me: 450000 }, paid: { me: 900000 }, mode: "equal" });
  store.del("tx", id);
  await wait(200);
  assert.ok(!fake.calls.some(([op]) => op === "upsert"), "nothing uploaded");
  const saved = JSON.parse(localStorage.getItem(`pl-acct-${user.id}`));
  assert.equal(saved.tx[id], undefined);
  assert.equal(Object.keys(saved.bills).length, 1);
});

test("keeps the server copy when the download fails, and tries again next sign-in", async () => {
  const id = "bbbbbbbb-0000-4000-8000-000000000002";
  fake.db.transactions.push({ id, user_id: user.id, type: "expense", amount: "1000", category: "Other", note: "y", date: "2026-10-20", created_at: "2026-10-20T01:00:00Z" });
  await store.signOut();
  fake.offline = true;
  await store.init();
  assert.equal(store.S.tx[id], undefined);
  assert.equal(fake.db.transactions.length, 1, "nothing deleted while offline");
  fake.offline = false;
  await store.signOut();
  await store.init();
  assert.equal(store.S.tx[id].amount, 1000);
  assert.equal(fake.db.transactions.length, 0);
});

test("offers guest records on sign-in with fresh ids", async () => {
  localStorage.setItem("pl-guest", JSON.stringify({ tx: { old1: { id: "old1", type: "expense", amount: 1000, category: "Other", note: "x", date: "2026-10-01" } }, bills: {}, events: {}, people: {}, meta: {} }));
  const n = store.moveGuestDataToAccount();
  assert.equal(n, 1);
  assert.ok(!store.S.tx.old1, "old id replaced");
  assert.ok(Object.values(store.S.tx).some((r) => r.note === "x" && /^[0-9a-f-]{36}$/.test(r.id)));
  assert.equal(localStorage.getItem("pl-guest"), null);
});

test("backup round-trips and resets the reminder", async () => {
  const now = Date.now(), month = 31 * 864e5;
  assert.equal(store.backupDue(now), false, "not due right away");
  assert.equal(store.backupDue(now + month), true, "due after 30 days");
  store.snoozeBackup();
  assert.equal(store.backupDue(Date.now() + 864e5), false, "“Later” waits a week");
  const backup = store.exportData();
  assert.equal(store.backupDue(Date.now() + 29 * 864e5), false);
  const before = Object.keys(store.S.tx).length;
  const counts = store.importData(JSON.parse(JSON.stringify(backup)));
  assert.equal(counts.tx, before);
  assert.throws(() => store.importData({ hello: 1 }), /isn't a Tiền Đâu backup/);
});

test("signing out keeps the records on the phone; signing in again brings them back", async () => {
  const n = Object.keys(store.S.tx).length;
  await store.signOut();
  assert.equal(store.sync.mode, "guest");
  assert.equal(Object.keys(store.S.tx).length, 0);
  assert.equal(Object.keys(JSON.parse(localStorage.getItem(`pl-acct-${user.id}`)).tx).length, n);
  await store.init();
  assert.equal(Object.keys(store.S.tx).length, n);
});

test("deleting the account removes its records from the phone", async () => {
  await store.deleteAccount();
  assert.equal(store.sync.mode, "guest");
  assert.equal(localStorage.getItem(`pl-acct-${user.id}`), null);
});
