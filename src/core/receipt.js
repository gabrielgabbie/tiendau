// Reading a receipt: turns the raw text from on-device OCR into shop name, total and date,
// then into one line for quick add ("Highlands Coffee 64.000đ 25/10"). Pure rules, no network.
import { parseDayMonth } from "./parser.js";

const norm = (s) => String(s || "").normalize("NFC");
const fold = (s) => norm(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

// lines that hold the amount to pay, strongest first
const TOTAL_WORDS = ["tong cong", "tong thanh toan", "thanh toan", "tong tien", "thanh tien", "phai tra", "khach phai tra", "can thanh toan", "grand total", "total", "amount due", "tong"];
// lines that are not items and not the total
const SKIP_WORDS = ["tien mat", "cash", "tien thua", "tien thoi", "thoi lai", "change", "tien khach dua", "khach dua", "chuyen khoan", "the ", "card", "vat", "thue", "tax", "tam tinh", "subtotal", "sub total", "giam gia", "discount", "khuyen mai", "chiet khau", "phi dich vu", "service", "so luong", "sl:", "qty", "don gia", "ma hd", "so hd", "hotline", "tel", "dt:", "mst", "wifi", "pass"];
// header lines that are never the shop name
const NOT_SHOP = ["hoa don", "phieu thanh toan", "phieu tinh tien", "bill", "receipt", "invoice", "dia chi", "dc:", "d/c", "address", "tel", "dt", "hotline", "mst", "ngay", "date", "gio", "ban", "table", "thu ngan", "cashier", "nhan vien", "so hd", "ma hd", "khach hang", "www", "http", ".com", ".vn"];

/** Money amounts in a line, read the way receipts print them: 64.000 / 64,000 / 1.234.000đ / 64000 VND. */
export function amountsIn(line) {
  // OCR often reads 0 as O/o and 1 as l/I inside numbers
  const s = norm(line).replace(/(?<=\d)[Oo]|[Oo](?=\d)/g, "0").replace(/(?<=\d)[lI]|[lI](?=\d{2})/g, "1");
  const out = [];
  for (const m of s.matchAll(/(?<![\d/])(\d{1,3}(?:[.,]\d{3})+|\d{4,9})(?:\s*(?:đ|d|vnd|₫|vnđ))?(?![\d/])/gi)) {
    const v = Number(m[1].replace(/[.,]/g, ""));
    if (v >= 1000 && v < 1e10) out.push(v);
  }
  return out;
}

/** The date printed on a receipt (dd/mm/yyyy, dd-mm-yyyy or dd.mm.yyyy), as YYYY-MM-DD. */
export function receiptDate(text) {
  const m = norm(text).match(/(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/);
  if (!m) return null;
  const hit = parseDayMonth(`${m[1]}/${m[2]}/${m[3]}`);
  return hit ? hit[0] : null;
}

function shopName(lines) {
  for (const raw of lines.slice(0, 6)) {
    const line = raw.replace(/[|*_=~<>«»"“”]+/g, " ").replace(/\s+/g, " ").trim();
    const f = fold(line);
    const letters = (line.match(/\p{L}/gu) || []).length;
    if (letters < 3 || letters < line.length * 0.5) continue; // mostly digits or symbols
    if (NOT_SHOP.some((w) => f.startsWith(w) || f.includes(" " + w + ":"))) continue;
    if (amountsIn(line).length) continue;
    // no numbers in the name, so they can't be read as the amount or a date later
    const name = line.replace(/\d+[\d/.:-]*/g, " ").replace(/^[\s\-–.,:]+|[\s\-–.,:]+$/g, "").replace(/\s+/g, " ").trim();
    if (name.length >= 3) return name.length > 40 ? name.slice(0, 40).trim() : titleCase(name);
  }
  return "";
}
// RECEIPTS SHOUT: "HIGHLANDS COFFEE" reads better as "Highlands Coffee"
function titleCase(s) {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

/** An item's name without its quantity and prices: "Phin Sữa Đá  1 x 39.000  39.000" → "Phin Sữa Đá". */
export function itemName(line) {
  const name = norm(line)
    .replace(/(\d+\s*[x×*]\s*)?\d{1,3}(?:[.,]\d{3})+\s*(đ|vnd|₫|d)?(?!\p{L})/giu, " ") // prices, "1 x 39.000"
    .replace(/(?<!\p{L})\d{4,}\s*(đ|vnd|₫)?(?!\p{L})/giu, " ") // prices without separators
    .replace(/(?<!\p{L})(?:[x×]\s*\d+|\d+\s*[x×])(?!\p{L})/giu, " ") // "x1", "2x"
    .replace(/^\s*\d+[.)]?\s+/, "") // leading line numbers / quantities
    .replace(/[|*_=~:]+/g, " ").replace(/\s+/g, " ").replace(/^[\s\-–.,]+|[\s\-–.,]+$/g, "").trim();
  return /\p{L}{2}/u.test(name) ? name : "";
}

/** Splits a bill into records: one per item, scaled so they add up to the total actually paid
 *  (VAT, service charge and discounts spread across items). With no items, one record for the total. */
export function billRecords({ shop, total, items }, fallbackName = "Bill") {
  const list = (items || []).filter((x) => x && x.name && x.amount > 0).map((x) => ({ ...x }));
  if (!list.length) return total > 0 ? [{ name: shop || fallbackName, amount: total }] : [];
  const sum = list.reduce((a, x) => a + x.amount, 0);
  if (total > 0 && total !== sum) {
    let left = total;
    list.forEach((x) => { x.amount = Math.round((x.amount * total) / sum); left -= x.amount; });
    list.sort((a, b) => b.amount - a.amount)[0].amount += left; // rounding remainder on the biggest item
  }
  return list.filter((x) => x.amount > 0);
}

/** Shop, total and date from OCR text. `total` is null when no amount could be found. */
export function readReceipt(text) {
  const lines = norm(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let total = null, totalRank = Infinity;
  const items = [];
  for (const line of lines) {
    const f = fold(line);
    const amts = amountsIn(line);
    if (!amts.length) continue;
    const rank = TOTAL_WORDS.findIndex((w) => f.includes(w));
    if (rank >= 0 && !SKIP_WORDS.some((w) => w !== "tong" && f.includes(w) && !f.includes("thanh toan"))) {
      const v = Math.max(...amts);
      // a stronger total word wins; with equal words, the later line (bottom of the bill) wins
      if (rank < totalRank || (rank === totalRank && v >= (total || 0))) { total = v; totalRank = rank; }
      continue;
    }
    if (SKIP_WORDS.some((w) => f.includes(w))) continue;
    const name = itemName(line);
    if (name) items.push({ name, amount: amts[amts.length - 1] });
  }
  const itemsSum = items.reduce((a, x) => a + x.amount, 0);
  if (total == null && items.length) total = itemsSum;
  return { shop: shopName(lines), total, date: receiptDate(text), items };
}

/** One quick-add line for a receipt, e.g. "Highlands Coffee 64.000đ 25/10". */
export function receiptLine({ shop, total, date }, fallbackName = "") {
  const name = shop || fallbackName;
  if (!total) return name;
  const amt = String(total).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "đ";
  const day = date ? ` ${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}${date.slice(0, 4) !== String(new Date().getFullYear()) ? "/" + date.slice(0, 4) : ""}` : "";
  return `${name} ${amt}${day}`.trim();
}

