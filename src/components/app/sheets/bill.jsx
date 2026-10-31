// New / edit shared bill: who's sharing, how items split, fees & discounts, who paid, and a live breakdown.
import { useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Minus, Plus, X } from "lucide-react";
import { EXP_CATS, round, today, money, compact, cur, isNum, adjAmount, ADJ_NAME, computeBill, finalizeBill, normalizeBill, t } from "@/core/index.js";
import { S } from "@/data/store.js";
import { uid, ui, settings, findOrCreatePerson, findOrCreateEvent, saveBill, deleteBill } from "@/lib/model.js";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppSheet, SheetActions, Section, Segmented, Chip, ConfirmButton, Amt, DateField, Field, useSheets } from "@/components/app/bits.jsx";
import { CategorySelect, SettleSheet } from "./records.jsx";

const QUICK_ADJ = [
  ["Shipping", { type: "fee", value: "", unit: "amount", alloc: "proportional" }],
  ["Service charge", { type: "fee", value: 5, unit: "percent", alloc: "proportional" }],
  ["VAT", { type: "fee", value: 8, unit: "percent", alloc: "proportional" }],
  ["Tip", { type: "fee", value: "", unit: "amount", alloc: "proportional" }],
  ["Discount", { type: "discount", value: "", unit: "amount", alloc: "proportional" }],
  ["Voucher %", { type: "discount", value: 10, unit: "percent", alloc: "proportional" }],
];
const MODE_HINT = { equal: "Everyone pays the same part of the subtotal.", items: "Type what each person ordered. Leave someone empty and they split whatever is left equally.", shares: "Give each person a number of shares, e.g. 2 for someone who ate double." };
const NEW_EVENT = "__new";
const NO_EVENT = "__none";
const small = "h-8 bg-background px-2";

export function BillSheet({ id, ...sheet }) {
  const { open, close } = useSheets();
  const ref = useRef(null);
  if (!ref.current) {
    let b;
    if (id) { b = JSON.parse(JSON.stringify(S.bills[id] || null)); if (b && b.kind !== "settle") normalizeBill(b); }
    else b = { kind: "bill", title: "", subtotal: "", mode: "equal", people: { me: { item: null, weight: 1 } }, adjustments: [], payers: [{ p: "me", amount: null }], eventId: ui.event !== "all" && ui.event !== "none" ? ui.event : null, category: "Food & Drinks", date: today() };
    // fees and discounts follow the bill's own split (equally / by item / by shares), so there's nothing extra to choose
    if (b) b.adjustments = (b.adjustments || []).map((a) => Object.assign({ id: uid() }, a, { alloc: "proportional", person: null }));
    ref.current = b;
  }
  const b = ref.current;
  const [, redraw] = useReducer((x) => x + 1, 0);
  const [logPaid, setLogPaid] = useState(id ? !!b?.linkedTx : true);
  const [eventSel, setEventSel] = useState(b?.eventId || NO_EVENT);
  const [eventNew, setEventNew] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [adding, setAdding] = useState(false); // the "add a person" row is open
  const [feesOpen, setFeesOpen] = useState(!!b?.adjustments?.length);
  if (!b) return null;
  if (b.kind === "settle") return <SettleSheet b={b} {...sheet} />;

  const change = (fn) => { fn(); redraw(); };
  const everyone = [{ id: "me", name: t("You") }, ...Object.values(S.people).sort((a, c) => a.name.localeCompare(c.name))];
  const nm = (p) => (p === "me" ? t("You") : (S.people[p]?.name || t("Someone")));
  const P = Object.keys(b.people);
  const r = computeBill(b);

  const join = (pid) => change(() => { if (!b.people[pid]) b.people[pid] = { item: null, weight: 1 }; });
  const addPerson = () => { const n = newPerson.trim(); if (!n) return; join(findOrCreatePerson(n)); setNewPerson(""); };
  // saved people not on this bill yet, offered while adding
  const suggestions = everyone.filter((p) => !b.people[p.id] && (!newPerson.trim() || p.name.toLowerCase().includes(newPerson.trim().toLowerCase())));
  const save = () => {
    const res = computeBill(b);
    if (!res.ok) { toast(res.errs[0]); document.getElementById("bPrev")?.scrollIntoView({ block: "center" }); return; }
    let ev = eventSel === NO_EVENT ? "" : eventSel; if (ev === NEW_EVENT) ev = findOrCreateEvent(eventNew) || "";
    b.adjustments = b.adjustments.filter((a) => Number(a.value) > 0).map((a) => Object.assign(a, { value: Number(a.value), label: a.label || ADJ_NAME(a) }));
    b.payers = b.payers.map((x) => ({ p: x.p, amount: isNum(x.amount) ? Number(x.amount) : null }));
    Object.assign(b, { id: id || uid(), kind: "bill", title: b.title.trim() || t("Shared bill"), eventId: ev || null, createdAt: b.createdAt || Date.now() });
    finalizeBill(b); saveBill(b, { log: logPaid });
    close(); toast(t("Bill saved"));
  };

  // one-line summaries for the collapsed sections
  const subtotal = Number(b.subtotal) || 0;
  const feesSummary = b.adjustments.length
    ? b.adjustments.map((a) => { const v = adjAmount(a, subtotal); return `${ADJ_NAME(a)}${v ? " " + (v > 0 ? "+" : "−") + compact(Math.abs(v)) : ""}`; }).join(", ")
    : t("None");
  const paySummary = b.payers.length > 1 ? t("{n} people paid", { n: b.payers.length })
    : b.payers[0]?.p === "me" ? t("You paid it all") : t("{name} paid it all", { name: nm(b.payers[0]?.p) });
  const rows = [...new Set([...P, ...Object.keys(r.paid)])];

  return (
    <AppSheet {...sheet} title={t(id ? "Edit shared bill" : "New shared bill")}>
      {/* the essentials: what, how much, when, which category/event */}
      <Input id="bTitle" aria-label={t("What for")} className="h-11 text-base" value={b.title} placeholder={t("Dinner, Grab Food order, villa…")} onChange={(e) => change(() => (b.title = e.target.value))} />
      <Field label={t("Items subtotal ({cur})", { cur: settings().currency })} htmlFor="bSub">
        {/* a plain text field with the number keypad: no up/down arrows */}
        <Input id="bSub" type="text" inputMode="decimal" autoComplete="off" placeholder="0" value={b.subtotal}
          onChange={(e) => change(() => (b.subtotal = e.target.value.replace(/[^\d.]/g, "")))}
          className="amt h-12 text-right text-xl md:text-xl" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <DateField id="bDate" value={b.date} onChange={(d) => change(() => (b.date = d || today()))} />
        <CategorySelect id="bCat" value={b.category || "Food & Drinks"} onChange={(v) => change(() => (b.category = v))} cats={EXP_CATS} />
      </div>
      <Select value={eventSel} onValueChange={setEventSel}>
        <SelectTrigger id="bEvent" aria-label={t("Event")} className="data-[size=default]:h-10 w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_EVENT}>{t("No event")}</SelectItem>
          {Object.values(S.events).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          <SelectItem value={NEW_EVENT}>{t("+ New event…")}</SelectItem>
        </SelectContent>
      </Select>
      {eventSel === NEW_EVENT && <Input className="h-10" placeholder={t("Event name")} value={eventNew} onChange={(e) => setEventNew(e.target.value)} autoFocus />}

      {/* who's sharing: always a list, one row per person, with how much each takes for the split chosen above it */}
      <Section title={t("Who's sharing")}>
        <Segmented label={t("How to split")} value={b.mode} onChange={(v) => change(() => (b.mode = v))} options={[["equal", t("Equally")], ["items", t("By what each ordered")], ["shares", t("By shares")]]} />
        <p className="text-xs text-muted-foreground">{t(MODE_HINT[b.mode])}</p>
        <div className="divide-y rounded-[8px] border bg-card">
          {P.map((p) => {
            const o = b.people[p];
            return (
              <div key={p} className="flex min-h-11 items-center gap-2 py-1.5 pr-1.5 pl-3">
                <span className="min-w-0 flex-1 truncate">{nm(p)}</span>
                {b.mode === "equal" && subtotal > 0 && <Amt className="text-sm text-muted-foreground">{money(r.shares[p] ?? subtotal / P.length)}</Amt>}
                {b.mode === "items" && <Input className={cn(small, "w-[110px] text-right")} type="text" inputMode="decimal" autoComplete="off" value={isNum(o.item) ? o.item : ""} placeholder={t("Rest")} aria-label={t("{name} ordered", { name: nm(p) })} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); change(() => (o.item = v === "" ? null : Number(v))); }} />}
                {b.mode === "shares" && (
                  <span className="inline-flex items-center gap-1">
                    <Button variant="outline" size="icon-sm" aria-label={t("Fewer shares")} onClick={() => change(() => (o.weight = Math.max(0, (isNum(o.weight) ? Number(o.weight) : 1) - 1)))}><Minus /></Button>
                    <Input className={cn(small, "w-12 text-center")} type="text" inputMode="decimal" autoComplete="off" value={isNum(o.weight) ? o.weight : 1} aria-label={t("{name} shares", { name: nm(p) })} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); change(() => (o.weight = v === "" ? 1 : Number(v))); }} />
                    <Button variant="outline" size="icon-sm" aria-label={t("More shares")} onClick={() => change(() => (o.weight = (isNum(o.weight) ? Number(o.weight) : 1) + 1))}><Plus /></Button>
                  </span>
                )}
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={t("Remove {name}", { name: nm(p) })} onClick={() => change(() => delete b.people[p])}><X /></Button>
              </div>
            );
          })}
          {!P.length && !adding && <div className="px-3 py-2.5 text-sm text-muted-foreground">{t("Add the people sharing this bill.")}</div>}
          {adding && (
            <div className="flex flex-col gap-2 px-3 py-2">
              <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); addPerson(); }}>
                <Input className="h-9 min-w-0 flex-1" autoFocus placeholder={t("Name")} aria-label={t("Add a person")} value={newPerson} onChange={(e) => setNewPerson(e.target.value)} />
                <Button size="sm" className="h-9" disabled={!newPerson.trim()}>{t("Add")}</Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t("Close")} onClick={() => { setAdding(false); setNewPerson(""); }}><X /></Button>
              </form>
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.slice(0, 12).map((p) => <Chip key={p.id} className="h-7 px-2.5 text-xs" onPressedChange={() => { join(p.id); setNewPerson(""); }}>+ {p.name}</Chip>)}
                </div>
              )}
            </div>
          )}
        </div>
        {!adding && <Button variant="link" className="h-auto self-start p-0" onClick={() => setAdding(true)}>{t("+ Add a person")}</Button>}
      </Section>

      {/* details stay folded until needed; each row shows what's set */}
      <div className="flex flex-col divide-y rounded-[8px] border bg-card">
        <Disclosure title={t("Fees & discounts")} summary={feesSummary} open={feesOpen} onOpenChange={setFeesOpen}>
          {b.adjustments.length > 0 && <p className="text-xs text-muted-foreground">{t("Shared the same way as the bill.")}</p>}
          {b.adjustments.map((a, i) => {
            return (
              <div key={a.id} className="flex items-center gap-1.5">
                <Input className={cn(small, "min-w-0 flex-1")} value={a.label} placeholder={t(a.type === "discount" ? "Discount" : "Fee")} aria-label={t("Name")} onChange={(e) => change(() => (a.label = e.target.value))} />
                <Input id={`adjv-${a.id}`} className={cn(small, "w-24 text-right", a.type === "discount" && "text-earn")} type="text" inputMode="decimal" autoComplete="off" placeholder="0" value={a.value} aria-label={t("Amount")}
                  onChange={(e) => change(() => (a.value = e.target.value.replace(/[^\d.]/g, "")))} />
                <Segmented size="sm" className="w-16" label={t("Unit")} value={a.unit} onChange={(u) => change(() => (a.unit = u))} options={[["amount", cur().sym], ["percent", "%"]]} />
                <Button variant="ghost" size="icon-sm" aria-label={t("Remove {name}", { name: ADJ_NAME(a) })} onClick={() => change(() => b.adjustments.splice(i, 1))}><X /></Button>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ADJ.map(([l, o]) => (
              <Chip key={l} className="h-7 px-2.5 text-xs" onPressedChange={() => { const a = Object.assign({ id: uid(), label: t(l.replace(" %", "")) }, o); change(() => b.adjustments.push(a)); setTimeout(() => document.getElementById(`adjv-${a.id}`)?.focus()); }}>+ {t(l)}</Chip>
            ))}
          </div>
        </Disclosure>

        <Disclosure title={t("Who paid")} summary={paySummary} defaultOpen={b.payers.length > 1}>
          {b.payers.map((x, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select value={x.p} onValueChange={(p) => change(() => (x.p = p))}>
                <SelectTrigger className="h-9 min-w-0 flex-1" aria-label={t("Payer")}><SelectValue /></SelectTrigger>
                <SelectContent>{everyone.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="h-9 w-[40%]" type="number" min="0" step="any" inputMode="decimal" value={isNum(x.amount) ? x.amount : ""} placeholder={t(b.payers.length > 1 ? "The rest" : "Full amount")} aria-label={t("Amount paid")} onChange={(e) => change(() => (x.amount = e.target.value === "" ? null : Number(e.target.value)))} />
              {b.payers.length > 1 && <Button variant="ghost" size="icon-sm" aria-label={t("Remove payer")} onClick={() => change(() => b.payers.splice(i, 1))}><X /></Button>}
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            <Button variant="link" className="h-auto p-0" onClick={() => change(() => { const used = new Set(b.payers.map((y) => y.p)); const next = everyone.find((p) => !used.has(p.id)) || everyone[0]; b.payers.push({ p: next.id, amount: null }); })}>{t("+ Add another payer")}</Button>
            {b.payers.length > 1 && <span className="text-xs text-muted-foreground">{t("Empty = pays the rest")}</span>}
          </div>
        </Disclosure>
      </div>

      {/* what each person ends up with */}
      <div id="bPrev" className="flex flex-col gap-2">
        {r.errs.length > 0 && (
          <Alert variant="destructive" className="border-0 bg-spend/10"><AlertDescription><ul className="flex flex-col gap-1">{r.errs.map((e) => <li key={e}>{e}</li>)}</ul></AlertDescription></Alert>
        )}
        {rows.length > 0 && subtotal > 0 && (
          <div className="flex flex-col rounded-[8px] border bg-card px-3 py-1">
            {rows.map((p) => {
              const share = r.shares[p] || 0, net = round((r.paid[p] || 0) - share);
              return (
                <div key={p} className="flex items-center gap-2 border-b border-border/60 py-2 text-sm last:border-b-0">
                  <span className="min-w-0 flex-1 truncate">{nm(p)}</span>
                  <Amt className="text-muted-foreground">{money(share)}</Amt>
                  <span className={cn("w-[7.5rem] text-right text-xs", net > 0 && "text-earn", net < 0 && "text-spend", Math.abs(net) < 0.01 && "text-muted-foreground")}>
                    {Math.abs(net) < 0.01 ? t("Even") : t(net > 0 ? "gets {amt}" : "owes {amt}", { amt: compact(Math.abs(net)) })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {r.paid.me > 0 && (
        <div className="flex items-center gap-2.5">
          <Checkbox id="bLog" checked={logPaid} onCheckedChange={(v) => setLogPaid(!!v)} />
          <Label htmlFor="bLog" className="text-[13px] leading-snug font-normal text-muted-foreground">{t("Add the {amt} I paid to my ledger", { amt: money(r.paid.me) })}</Label>
        </div>
      )}
      <SheetActions left={id && <ConfirmButton label={t("Delete")} confirmLabel={t("Tap again to delete")} onConfirm={() => { deleteBill(id); close(); toast(t("Bill deleted")); }} />}>
        <Button variant="outline" onClick={close}>{t("Cancel")}</Button>
        <Button onClick={save}>{t("Save")}{r.total > 0 && <span className="amt font-normal opacity-80">· {money(r.total)}</span>}</Button>
      </SheetActions>
    </AppSheet>
  );
}

/** A folded section: title and a one-line summary; tapping opens the controls underneath. */
function Disclosure({ title, summary, defaultOpen = false, open: openProp, onOpenChange, children }) {
  const [own, setOwn] = useState(defaultOpen);
  const open = openProp ?? own;
  const toggle = () => (onOpenChange ? onOpenChange(!open) : setOwn(!open));
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={toggle} className="flex w-full items-center gap-3 px-3 py-3 text-left">
        <span className="font-medium">{title}</span>
        <span className="ml-auto min-w-0 truncate text-[13px] text-muted-foreground">{summary}</span>
        <ChevronDown className={cn("size-4 flex-none text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="flex flex-col gap-2.5 px-3 pb-3">{children}</div>}
    </div>
  );
}
