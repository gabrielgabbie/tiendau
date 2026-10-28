// Tests the account sync logic against an in-memory stand-in for Supabase.
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

test("signs in from a saved session and loads records", async () => {
  await store.init();
  assert.equal(store.sync.mode, "account");
  const t = store.S.tx["aaaaaaaa-0000-4000-8000-000000000001"];
  assert.equal(t.amount, 55000);
  assert.equal(t.category, "Food & Drinks", "old category names are migrated");
  assert.equal(store.sync.status, "saved");
});

test("saves new records to the server", async () => {
  const id = crypto.randomUUID();
  store.put("tx", { id, type: "expense", amount: 32000, category: "Transport", note: "Grab", date: "2026-10-25", createdAt: Date.now() });
  await wait();
  const row = fake.db.transactions.find((r) => r.id === id);
  assert.ok(row, "row was upserted");
  assert.equal(row.user_id, user.id);
  assert.equal(store.sync.pending, 0);
});

test("stores bills with split details in data", async () => {
  const id = crypto.randomUUID();
  store.put("bills", { id, kind: "bill", title: "Lẩu", date: "2026-10-25", category: "Food & Drinks", eventId: null, amount: 900000, shares: { me: 450000, x: 450000 }, paid: { me: 900000 }, mode: "equal", createdAt: Date.now() });
  await wait();
  const row = fake.db.bills.find((r) => r.id === id);
  assert.equal(row.amount, 900000);
  assert.deepEqual(row.data.shares, { me: 450000, x: 450000 });
  assert.equal(row.title, "Lẩu");
});

test("queues changes while offline and sends them when back", async () => {
  fake.offline = true;
  const id = crypto.randomUUID();
  store.put("tx", { id, type: "income", amount: 25000000, category: "Salary", note: "Lương", date: "2026-10-25" });
  await wait();
  assert.equal(store.sync.status, "offline");
  assert.equal(store.sync.pending, 1);
  assert.ok(store.S.tx[id], "shown right away");
  assert.ok(JSON.parse(localStorage.getItem(`pl-queue-${user.id}`)).length === 1, "queue survives a reload");
  // editing the same record again keeps only the latest change in the queue
  store.put("tx", { ...store.S.tx[id], amount: 26000000 });
  await wait();
  assert.equal(store.sync.pending, 1);
  fake.offline = false;
  store.put("people", { id: crypto.randomUUID(), name: "An" }); // any new change triggers a retry
  await wait(40);
  assert.equal(store.sync.pending, 0);
  assert.equal(fake.db.transactions.find((r) => r.id === id).amount, 26000000);
  assert.equal(store.sync.status, "saved");
});

test("applies changes from other devices live", async () => {
  const id = crypto.randomUUID();
  fake.remote("INSERT", "transactions", { id, user_id: user.id, type: "expense", amount: 120000, category: "Bills", note: "Wifi", date: "2026-10-24", created_at: new Date().toISOString() });
  assert.equal(store.S.tx[id].amount, 120000);
  fake.remote("DELETE", "transactions", { id });
  assert.equal(store.S.tx[id], undefined);
});

test("deletes reach the server", async () => {
  const id = Object.keys(store.S.tx)[0];
  store.del("tx", id);
  await wait();
  assert.ok(!fake.db.transactions.some((r) => r.id === id));
});

test("offers guest records on sign-in with fresh ids", async () => {
  const counts = store.countGuest();
  assert.deepEqual(counts, { tx: 0, bills: 0 });
  localStorage.setItem("pl-guest", JSON.stringify({ tx: { old1: { id: "old1", type: "expense", amount: 1000, category: "Other", note: "x", date: "2026-10-01" } }, bills: {}, events: {}, people: {}, meta: {} }));
  const n = store.moveGuestDataToAccount();
  assert.equal(n, 1);
  await wait();
  assert.ok(!store.S.tx.old1, "old id replaced");
  assert.ok(fake.db.transactions.some((r) => r.note === "x" && /^[0-9a-f-]{36}$/.test(r.id)));
  assert.equal(localStorage.getItem("pl-guest"), null);
});

test("backup round-trips", async () => {
  const backup = store.exportData();
  const before = Object.keys(store.S.tx).length;
  const counts = store.importData(JSON.parse(JSON.stringify(backup)));
  assert.equal(counts.tx, before);
  assert.throws(() => store.importData({ hello: 1 }), /isn't a Tiền Đâu backup/);
});

test("signing out clears this account's records and goes back to the app without an account", async () => {
  await store.signOut();
  assert.equal(store.sync.mode, "guest");
  assert.equal(Object.keys(store.S.tx).length, 0);
  assert.equal(localStorage.getItem(`pl-acct-${user.id}`), null);
});
