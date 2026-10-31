// Tidying bill text with the browser's on-device model, using a stand-in for Chrome's LanguageModel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tidyBillText, onDeviceAIReady } from "../src/lib/on-device-ai.js";

const BILL = "HIGHLANDS COFFEE\nPhin sua da 29.000\nBanh mi 35.000\nTONG CONG 64.000\nTien khach dua 100.000";
const fakeModel = (answer, availability = "available") => {
  globalThis.LanguageModel = { availability: async () => availability, create: async () => ({ prompt: async () => JSON.stringify(answer), destroy() {} }) };
};

test("without a model in the browser, it steps aside", async () => {
  delete globalThis.LanguageModel;
  assert.equal(await onDeviceAIReady(), false);
  assert.equal(await tidyBillText(BILL), null);
});

test("never starts a model download", async () => {
  fakeModel({}, "downloadable");
  assert.equal(await tidyBillText(BILL), null);
});

test("uses the model's answer when its amounts are on the bill", async () => {
  fakeModel({ shop: "Highlands Coffee", total: 64000, category: "Food & Drinks", items: [{ name: "Phin sữa đá", amount: 29000, category: "Food & Drinks" }, { name: "Bánh mì", amount: 35000, category: "Food & Drinks" }] });
  const r = await tidyBillText(BILL);
  assert.equal(r.total, 64000);
  assert.deepEqual(r.items.map((i) => i.name), ["Phin sữa đá", "Bánh mì"]);
});

test("drops amounts the model made up", async () => {
  fakeModel({ shop: "X", total: 99000, category: "Other", items: [{ name: "Ghost", amount: 12000, category: "Other" }, { name: "Bánh mì", amount: 35000, category: "Food & Drinks" }] });
  const r = await tidyBillText(BILL);
  assert.deepEqual(r.items.map((i) => i.name), ["Bánh mì"]);
  assert.equal(r.total, 35000, "a made-up total falls back to the items");
  fakeModel({ shop: "X", total: 1, category: "Other", items: [] });
  assert.equal(await tidyBillText(BILL), null);
  delete globalThis.LanguageModel;
});
