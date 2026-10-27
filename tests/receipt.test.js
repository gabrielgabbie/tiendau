// Tests reading receipts from OCR text, and written dates in quick add.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readReceipt, receiptLine, amountsIn, localParse, parseDayMonth, today } from "../src/core/index.js";

test("reads shop, total and date from a café receipt, ignoring cash and change", () => {
  const r = readReceipt(`HIGHLANDS COFFEE
Đ/c: 135 Nam Kỳ Khởi Nghĩa, Q1
Hotline: 1900 1755
HÓA ĐƠN THANH TOÁN
Số HĐ: 00123   Ngày: 25/10/2026 08:42
Phin Sữa Đá    1 x 39.000   39.000
Bánh mì que    1 x 25.000   25.000
Tổng cộng                   64.000
Tiền khách đưa             100.000
Tiền thối lại               36.000`);
  assert.deepEqual([r.shop, r.total, r.date], ["Highlands Coffee", 64000, "2026-10-25"]);
  assert.equal(receiptLine(r), "Highlands Coffee 64.000đ 25/10");
});

test("prefers the amount to pay over the subtotal, with comma thousands", () => {
  const r = readReceipt(`BÁCH HÓA XANH
Ngày 20-10-2026
Rau muống          15,000
Thịt heo 0.5kg     72,500
Tạm tính          119,500
Giảm giá           -9,500
TỔNG THANH TOÁN   110,000
Tiền mặt          200,000`);
  assert.deepEqual([r.shop, r.total, r.date], ["Bách Hóa Xanh", 110000, "2026-10-20"]);
});

test("fixes OCR's O-for-0 in numbers and sums items when there's no total line", () => {
  assert.deepEqual(amountsIn("Thanh tien 13O.000 d"), [130000]);
  const r = readReceipt(`Quán Bún Chả Hương Liên
Bún chả       60000
Nem cua bể    40000`);
  assert.deepEqual([r.shop, r.total], ["Quán Bún Chả Hương Liên", 100000]);
});

test("finds no total in text without amounts", () => {
  assert.equal(readReceipt("Cảm ơn quý khách!").total, null);
});

test("quick add understands written dates and keeps them out of the amount", () => {
  const [x] = localParse("cà phê 45k 3/9").items;
  assert.deepEqual([x.amount, x.date.slice(5)], [45000, "09-03"]);
  assert.equal(localParse("phở 55k ngày 1/1/2026").items[0].date, "2026-01-01");
  assert.equal(parseDayMonth("31/2"), null, "impossible dates are ignored");
  const future = parseDayMonth("31/12");
  assert.ok(future[0] <= today(), "a date without a year is never in the future");
});
