// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setCurrency, money, localParse, guessCat, computeBill, finalizeBill, balances, settlePlan, addDays, today,
} from "../src/core/index.js";

setCurrency("VND");

test("formats VND", () => {
  assert.equal(money(55000), "55.000 ₫");
  assert.equal(money(-1200000, { sign: true }), "−1.200.000 ₫");
});

test("reads amounts and shorthand", () => {
  const r = localParse("phở 55k, grab 32k yesterday").items;
  assert.equal(r.length, 2);
  assert.deepEqual([r[0].amount, r[0].category], [55000, "Food & Drinks"]);
  assert.deepEqual([r[1].amount, r[1].category, r[1].date], [32000, "Transport", addDays(-1)]);
  assert.equal(localParse("coffee 45.000đ").items[0].amount, 45000);
  assert.equal(localParse("salary 25tr").items[0].type, "income");
});

test("a month in the text isn't the amount, and a number with a unit beats a bare count", () => {
  const pick = (s) => localParse(s).items.map((i) => [i.type, i.amount, i.note]);
  assert.deepEqual(pick("luong t10 34567890"), [["income", 34567890, "Luong t10"]]);
  assert.deepEqual(pick("lương tháng 10 15tr"), [["income", 15000000, "Lương tháng 10"]]);
  assert.deepEqual(pick("điện thg 9 1.2tr"), [["expense", 1200000, "Điện thg 9"]]);
  assert.deepEqual(pick("thưởng 10/2026 5tr"), [["income", 5000000, "Thưởng 10/2026"]]);
  assert.deepEqual(pick("trà sữa 2 ly 90k"), [["expense", 90000, "Trà sữa 2 ly"]]);
});

test("reads amounts the way speech recognition writes them", () => {
  const pho = localParse("phở 55 nghìn đồng").items[0];
  assert.deepEqual([pho.amount, pho.note], [55000, "Phở"]);
  assert.deepEqual(localParse("cà phê 45.000 đồng").items.map((i) => [i.amount, i.note]), [[45000, "Cà phê"]]);
  assert.equal(localParse("lương 25 triệu").items[0].amount, 25000000);
  assert.deepEqual(localParse("taxi 50 thousand").items.map((i) => [i.amount, i.note]), [[50000, "Taxi"]]);
});

test("categorises Vietnamese and unaccented text", () => {
  const cases = {
    "đi chợ": "Food & Drinks", "di cho": "Food & Drinks", "grab food": "Food & Drinks", "grab": "Transport",
    "căn hộ": "Housing", "nhà thuốc": "Health", "tiền điện": "Bills", "học phí": "Education", "mừng cưới": "Gifts",
  };
  for (const [t, c] of Object.entries(cases)) assert.equal(guessCat(t, false), c, t);
});

test("recognises drinks, fruit and beauty services", () => {
  assert.equal(guessCat("thơm dâu đá xay", false), "Food & Drinks");
  assert.equal(guessCat("chè thái", false), "Food & Drinks");
  for (const s of ["tẩy tóc", "cắt tóc", "gội đầu", "làm nail", "spa", "massage", "haircut"]) assert.equal(guessCat(s, false), "Beauty & Care", s);
  assert.equal(guessCat("dầu gội", false), "Shopping");
  assert.equal(guessCat("nước hoa thơm", false), "Shopping");
  assert.equal(guessCat("mừng cô dâu", false), "Gifts");
  assert.equal(guessCat("karaoke", false), "Entertainment");
});

test("a trip to a destination is Travel, unless something more specific matches", () => {
  const cases = {
    "Đi chơi đà lạt": "Travel", "di choi da lat": "Travel", "vũng tàu cuối tuần": "Travel",
    "đi chơi": "Entertainment", "lẩu đà lạt": "Food & Drinks", "vé xe đi đà lạt": "Transport",
    "đi chơi sầm sơn": "Travel", "hạ long 3 ngày": "Travel", "cà mau": "Travel", "lao cai": "Travel",
    "phở hà nội": "Food & Drinks", "bún bò huế": "Food & Drinks", "taxi sài gòn": "Transport", "tàu điện": "Transport",
  };
  for (const [s, c] of Object.entries(cases)) assert.equal(guessCat(s, false), c, s);
  assert.equal(localParse("Đi chơi đà lạt 2tr").items[0].category, "Travel");
});

test("parses shared bills with fees, payer and event", () => {
  const [b] = localParse("Dinner 2tr với An và Bình svc 5% vat 8% ship 30k An paid #Dalat").items;
  assert.equal(b.type, "bill");
  assert.equal(b.subtotal, 2000000);
  assert.deepEqual(b.people.map((p) => p.name), ["me", "An", "Bình"]);
  assert.deepEqual(b.adjustments.map((a) => a.label), ["Shipping", "Service charge", "VAT"]);
  assert.equal(b.payers[0].name, "An");
  assert.equal(b.event, "Dalat");
});

test("parses settle-up payments", () => {
  const [s] = localParse("An paid me back 400k").items;
  assert.deepEqual([s.type, s.from, s.to, s.amount], ["settle", "An", "me", 400000]);
});

test("splits by items with fees by share and shipping equally", () => {
  const b = {
    subtotal: 500000, mode: "items",
    people: { me: { item: 200000 }, an: { item: null }, chi: { item: null } },
    adjustments: [
      { label: "Shipping", type: "fee", value: 30000, unit: "amount", alloc: "equal" },
      { label: "Discount", type: "discount", value: 50000, unit: "amount", alloc: "proportional" },
    ],
    payers: [{ p: "me", amount: 100000 }, { p: "an", amount: null }],
  };
  const r = finalizeBill(b);
  assert.ok(r.ok, r.errs.join());
  assert.equal(b.amount, 480000);
  assert.deepEqual(b.shares, { me: 190000, an: 145000, chi: 145000 });
  assert.deepEqual(b.paid, { me: 100000, an: 380000 });
});

test("reports amounts that don't add up", () => {
  const r = computeBill({ subtotal: 100000, mode: "equal", people: { me: {}, a: {} }, payers: [{ p: "me", amount: 30000 }, { p: "a", amount: 30000 }] });
  assert.equal(r.ok, false);
  assert.match(r.errs[0], /has no payer/);
});

test("settles a group with few payments", () => {
  const bills = {
    a: { amount: 300000, paid: { me: 300000 }, shares: { me: 100000, an: 100000, chi: 100000 } },
    b: { amount: 90000, paid: { an: 90000 }, shares: { me: 30000, an: 30000, chi: 30000 } },
  };
  const net = balances({ bills }, "all");
  assert.deepEqual(net, { me: 170000, an: -40000, chi: -130000 });
  const plan = settlePlan(net);
  assert.equal(plan.length, 2);
  assert.equal(plan.reduce((s, p) => s + p.amount, 0), 170000);
});
