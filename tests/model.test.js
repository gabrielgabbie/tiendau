// Tests the app logic the screens share (shared bills, settle-ups, quick add), in both languages.
import { test } from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.document = { documentElement: { lang: "vi", classList: { toggle() {} }, style: {} }, querySelector: () => null };

const { setLang, finalizeBill } = await import("../src/core/index.js");
const store = await import("../src/data/store.js");
const model = await import("../src/lib/model.js");

const bill = (payers, extra = {}) => {
  const b = { id: crypto.randomUUID(), kind: "bill", title: "Hải sản", subtotal: 900000, mode: "equal", people: { me: {}, minh: {}, lan: {} }, adjustments: [], payers, category: "Food & Drinks", date: "2026-10-25", ...extra };
  finalizeBill(b);
  return b;
};
store.put("people", { id: "minh", name: "Minh" });

for (const lang of ["vi", "en"]) {
  test(`a shared bill I paid puts the full amount I paid in my ledger (${lang})`, () => {
    setLang(lang);
    const b = model.saveBill(bill([{ p: "me", amount: null }]));
    const rec = store.S.tx[b.linkedTx];
    assert.equal(rec.type, "expense");
    assert.equal(rec.amount, 900000, "what I paid, not my 300k share");
    assert.equal(rec.note, "Hải sản");
  });
}

test("a bill split between payers logs only my part of the payment", () => {
  const b = model.saveBill(bill([{ p: "me", amount: 200000 }, { p: "minh", amount: null }]));
  assert.equal(store.S.tx[b.linkedTx].amount, 200000);
});

test("a bill someone else paid adds nothing to my ledger", () => {
  const b = model.saveBill(bill([{ p: "minh", amount: null }]));
  assert.equal(b.linkedTx ?? null, null);
});

test("being paid back adds income; paying back adds an expense; others' payments add nothing", () => {
  setLang("vi");
  const inBill = model.saveSettle({ id: crypto.randomUUID(), kind: "settle", amount: 300000, paidBy: "minh", shares: { me: 300000 }, date: "2026-10-26" });
  const inc = store.S.tx[inBill.linkedTx];
  assert.deepEqual([inc.type, inc.amount, inc.category, inc.note], ["income", 300000, "Refund", "Minh trả lại bạn"]);

  const outBill = model.saveSettle({ id: crypto.randomUUID(), kind: "settle", amount: 150000, paidBy: "me", shares: { minh: 150000 }, date: "2026-10-26" });
  assert.equal(store.S.tx[outBill.linkedTx].type, "expense");

  const others = model.saveSettle({ id: crypto.randomUUID(), kind: "settle", amount: 50000, paidBy: "minh", shares: { lan: 50000 }, date: "2026-10-26" });
  assert.equal(others.linkedTx ?? null, null);

  model.deleteBill(inBill.id);
  assert.equal(store.S.tx[inBill.linkedTx], undefined, "undoing a payment removes its ledger entry");
});

test("quick add turns a chat line into records", () => {
  model.send("phở 55k, grab 32k");
  const added = Object.values(store.S.tx).filter((x) => x.note === "Phở" || x.note === "Grab");
  assert.equal(added.length, 2);
});

test("a shared bill typed in chat logs the full amount I paid", () => {
  model.send("lẩu 1.2tr với Minh, Lan");
  const rec = Object.values(store.S.tx).find((x) => x.note.toLowerCase() === "lẩu");
  assert.ok(rec, "ledger record for the bill");
  assert.equal(rec.amount, 1200000);
});
