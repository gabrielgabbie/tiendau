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

test("a scanned receipt's category hint fills in when the text alone can't tell", () => {
  model.send("Pho Thin Lo Duc 130.000đ", { categoryHint: "Food & Drinks" });
  const rec = Object.values(store.S.tx).find((x) => x.note === "Pho Thin Lo Duc");
  assert.equal(rec.category, "Food & Drinks");
  model.send("Highlands Coffee 64.000đ", { categoryHint: "Shopping" });
  assert.equal(Object.values(store.S.tx).find((x) => x.note === "Highlands Coffee").category, "Food & Drinks", "a clear match beats the hint");
});

test("a bill photo becomes one record per item, adding up to what was paid, on the bill's date", () => {
  const before = Object.keys(store.S.tx).length;
  const id = model.startBill({ thumb: "data:image/jpeg;base64,AA", text: "" });
  assert.ok(model.chatLog.at(-1).pending, "shows a reading… reply");
  model.finishBill(id, { shop: "Bách Hóa Xanh", total: 110000, date: "2026-10-20", category: "Food & Drinks",
    items: [{ name: "Rau muống", amount: 15000 }, { name: "Thịt heo", amount: 72500 }, { name: "Nước rửa chén", amount: 32000, category: "Shopping" }] });
  const made = model.chatLog.at(-1).made.map((r) => store.S.tx[r.id]);
  assert.equal(Object.keys(store.S.tx).length, before + 3);
  assert.equal(made.reduce((a, x) => a + x.amount, 0), 110000, "discount spread across items");
  assert.ok(made.every((x) => x.date === "2026-10-20"));
  assert.equal(made.find((x) => x.note === "Nước rửa chén").category, "Shopping", "each item keeps its own category");
  assert.equal(made.find((x) => x.note === "Rau muống").category, "Food & Drinks");
});

test("a bill photo with a note like 'dinner with Minh' becomes one shared bill for the total", () => {
  const id = model.startBill({ thumb: "", text: "lẩu với Minh" });
  model.finishBill(id, { shop: "Lẩu Phan", total: 600000, date: null, items: [{ name: "Lẩu thái", amount: 600000 }] }, { text: "lẩu với Minh" });
  const [r] = model.chatLog.at(-1).made;
  assert.equal(r.col, "bills");
  assert.equal(store.S.bills[r.id].amount, 600000);
});

test("a photo with no prices says so instead of adding anything", () => {
  const id = model.startBill({ thumb: "", text: "" });
  model.finishBill(id, { shop: "", total: null, items: [] });
  assert.equal(model.chatLog.at(-1).made.length, 0);
});
