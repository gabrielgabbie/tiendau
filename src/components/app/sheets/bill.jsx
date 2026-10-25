// New / edit shared bill: who's sharing, how items split, fees & discounts, who paid, and a live breakdown.
import { useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, X } from "lucide-react";
import { EXP_CATS, round, today, money, cur, isNum, adjAmount, ADJ_NAME, computeBill, finalizeBill, normalizeBill, t } from "@/core/index.js";
import { S } from "@/data/store.js";
import { uid, ui, settings, findOrCreatePerson, findOrCreateEvent, saveBill, deleteBill } from "@/lib/model.js";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AppSheet, SheetActions, Field, Section, Segmented, Chip, ConfirmButton, Amt, useSheets } from "@/components/app/bits.jsx";
import { CategorySelect, SettleSheet } from "./records.jsx";

const QUICK_ADJ = [
  ["Shipping", { type: "fee", value: "", unit: "amount", alloc: "equal" }],
  ["Service charge", { type: "fee", value: 5, unit: "percent", alloc: "proportional" }],
  ["VAT", { type: "fee", value: 8, unit: "percent", alloc: "proportional" }],
  ["Tip", { type: "fee", value: "", unit: "amount", alloc: "equal" }],
  ["Discount", { type: "discount", value: "", unit: "amount", alloc: "proportional" }],
  ["Voucher %", { type: "discount", value: 10, unit: "percent", alloc: "proportional" }],
];
const ALLOC_LABEL = { proportional: "By what each ordered", equal: "Split equally", person: "One person covers it" };
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
    if (b) b.adjustments = (b.adjustments || []).map((a) => Object.assign({ id: uid() }, a));
    ref.current = b;
  }
  const b = ref.current;
  const [, redraw] = useReducer((x) => x + 1, 0);
  const [logPaid, setLogPaid] = useState(id ? !!b?.linkedTx : true);
  const [eventSel, setEventSel] = useState(b?.eventId || NO_EVENT);
  const [eventNew, setEventNew] = useState("");
  const [newPerson, setNewPerson] = useState("");
  if (!b) return null;
  if (b.kind === "settle") return <SettleSheet b={b} {...sheet} />;

  const change = (fn) => { fn(); redraw(); };
  const everyone = [{ id: "me", name: t("You") }, ...Object.values(S.people).sort((a, c) => a.name.localeCompare(c.name))];
  const nm = (p) => (p === "me" ? t("You") : (S.people[p]?.name || t("Someone")));
  const P = Object.keys(b.people);
  const r = computeBill(b);

  const addPerson = () => { const n = newPerson.trim(); if (!n) return; const pid = findOrCreatePerson(n); change(() => { if (!b.people[pid]) b.people[pid] = { item: null, weight: 1 }; }); setNewPerson(""); };
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

  // breakdown
  const rows = [...new Set([...P, ...Object.keys(r.paid)])];
  const lines = [[t("Items"), r.subtotal], ...b.adjustments.map((a) => [ADJ_NAME(a) + (a.unit === "percent" && a.value ? ` ${a.value}%` : ""), round(adjAmount(a, r.subtotal))]).filter((x) => x[1])];

  return (
    <AppSheet {...sheet} title={t(id ? "Edit shared bill" : "New shared bill")}>
      <Field label={t("What for")} htmlFor="bTitle"><Input id="bTitle" className="h-10" value={b.title} placeholder={t("Dinner, Grab Food order, villa…")} onChange={(e) => change(() => (b.title = e.target.value))} /></Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label={t("Date")} htmlFor="bDate"><Input id="bDate" className="h-10" type="date" value={b.date} onChange={(e) => change(() => (b.date = e.target.value || today()))} /></Field>
        <Field label={t("Category")} htmlFor="bCat"><CategorySelect id="bCat" value={b.category || "Food & Drinks"} onChange={(v) => change(() => (b.category = v))} cats={EXP_CATS} /></Field>
      </div>
      <Field label={t("Event")} htmlFor="bEvent">
        <Select value={eventSel} onValueChange={setEventSel}>
          <SelectTrigger id="bEvent" className="h-10 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_EVENT}>{t("No event")}</SelectItem>
            {Object.values(S.events).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            <SelectItem value={NEW_EVENT}>{t("+ New event…")}</SelectItem>
          </SelectContent>
        </Select>
        {eventSel === NEW_EVENT && <Input className="h-10" placeholder={t("Event name")} value={eventNew} onChange={(e) => setEventNew(e.target.value)} autoFocus />}
      </Field>

      <Section title={t("Who's sharing")}>
        <div className="flex flex-wrap gap-2">
          {everyone.map((p) => (
            <Chip key={p.id} on={!!b.people[p.id]} onPressedChange={() => change(() => { if (b.people[p.id]) delete b.people[p.id]; else b.people[p.id] = { item: null, weight: 1 }; })}>{p.name}</Chip>
          ))}
        </div>
        <div className="flex gap-2">
          <Input className="h-10" placeholder={t("Add a person")} value={newPerson} onChange={(e) => setNewPerson(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPerson(); } }} />
          <Button variant="outline" className="h-10" onClick={addPerson}>{t("Add")}</Button>
        </div>
      </Section>

      <Section title={t("Items")}>
        <Field label={t("Items subtotal ({cur})", { cur: settings().currency })} htmlFor="bSub" hint={t("The bill before fees, service charge and discounts.")}>
          <Input id="bSub" className="h-10" type="number" inputMode="decimal" min="0" step="any" value={b.subtotal} onChange={(e) => change(() => (b.subtotal = e.target.value))} />
        </Field>
        <Segmented label={t("How to split")} value={b.mode} onChange={(v) => change(() => (b.mode = v))} options={[["equal", t("Equally")], ["items", t("By what each ordered")], ["shares", t("By shares")]]} />
        <p className="text-xs text-muted-foreground">{t(MODE_HINT[b.mode])}</p>
        <div className="divide-y rounded-lg border bg-card">
          {P.length ? P.map((p) => {
            const o = b.people[p];
            const base = b.mode === "items" && isNum(o.item) ? "" : (r.base[p] || r.base[p] === 0) && Number(b.subtotal) ? money(r.base[p]) : "";
            return (
              <div key={p} className="flex items-center gap-2.5 px-3 py-2">
                <span className="flex-1 font-medium">{nm(p)}</span>
                {b.mode === "items" && <Input className={cn(small, "w-[110px]")} type="number" min="0" step="any" inputMode="decimal" value={isNum(o.item) ? o.item : ""} placeholder={t("Rest")} aria-label={t("{name} ordered", { name: nm(p) })} onChange={(e) => change(() => (o.item = e.target.value === "" ? null : Number(e.target.value)))} />}
                {b.mode === "shares" && (
                  <span className="inline-flex items-center gap-1">
                    <Button variant="outline" size="icon-sm" aria-label={t("Fewer shares")} onClick={() => change(() => (o.weight = Math.max(0, (isNum(o.weight) ? Number(o.weight) : 1) - 1)))}><Minus /></Button>
                    <Input className={cn(small, "w-14 text-center")} type="number" min="0" step="0.5" value={isNum(o.weight) ? o.weight : 1} aria-label={t("{name} shares", { name: nm(p) })} onChange={(e) => change(() => (o.weight = e.target.value === "" ? 1 : Number(e.target.value)))} />
                    <Button variant="outline" size="icon-sm" aria-label={t("More shares")} onClick={() => change(() => (o.weight = (isNum(o.weight) ? Number(o.weight) : 1) + 1))}><Plus /></Button>
                  </span>
                )}
                <Amt className="min-w-20 text-right text-[13px] text-muted-foreground">{base}</Amt>
              </div>
            );
          }) : <div className="px-3 py-2 text-muted-foreground">{t("Pick people above.")}</div>}
        </div>
      </Section>

      <Section title={t("Fees & discounts")}>
        {b.adjustments.map((a, i) => {
          const v = adjAmount(a, Number(b.subtotal) || 0);
          return (
            <div key={a.id} className={cn("flex flex-col gap-2 rounded-xl border bg-card p-2.5", a.type === "discount" && "border-dashed")}>
              <div className="flex flex-wrap items-center gap-2">
                <Input className={cn(small, "min-w-0 flex-[1_1_120px]")} value={a.label} placeholder={t(a.type === "discount" ? "Discount" : "Fee")} aria-label={t("Name")} onChange={(e) => change(() => (a.label = e.target.value))} />
                <Segmented size="sm" label={t("Fee or discount")} value={a.type} onChange={(ty) => change(() => (a.type = ty))} options={[["fee", t("Fee")], ["discount", t("Discount")]]} />
                <Button variant="ghost" size="icon-sm" aria-label={t("Remove {name}", { name: ADJ_NAME(a) })} onClick={() => change(() => b.adjustments.splice(i, 1))}><X /></Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input id={`adjv-${a.id}`} className={cn(small, "w-[120px]")} type="number" min="0" step="any" inputMode="decimal" value={a.value} aria-label={t("Amount")} onChange={(e) => change(() => (a.value = e.target.value))} />
                <Segmented size="sm" label={t("Unit")} value={a.unit} onChange={(u) => change(() => (a.unit = u))} options={[["amount", cur().sym], ["percent", "%"]]} />
                <Amt className={cn("ml-auto text-[13px]", v < 0 && "text-earn")}>{v ? money(v, { sign: true }) : ""}</Amt>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={a.alloc} onValueChange={(al) => change(() => (a.alloc = al))}>
                  <SelectTrigger size="sm" className="min-w-0 flex-[1_1_140px] bg-background" aria-label={t("How to split")}><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(ALLOC_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{t(l)}</SelectItem>)}</SelectContent>
                </Select>
                {a.alloc === "person" && (
                  <Select value={a.person || ""} onValueChange={(p) => change(() => (a.person = p || null))}>
                    <SelectTrigger size="sm" className="min-w-0 flex-[1_1_140px] bg-background" aria-label={t("Who covers it")}><SelectValue placeholder={t("Who?")} /></SelectTrigger>
                    <SelectContent>{P.map((p) => <SelectItem key={p} value={p}>{nm(p)}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          {QUICK_ADJ.map(([l, o]) => (
            <Chip key={l} onPressedChange={() => { const a = Object.assign({ id: uid(), label: t(l.replace(" %", "")) }, o); change(() => b.adjustments.push(a)); setTimeout(() => document.getElementById(`adjv-${a.id}`)?.focus()); }}>+ {t(l)}</Chip>
          ))}
        </div>
      </Section>

      <Section title={t("Who paid")}>
        {b.payers.map((x, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select value={x.p} onValueChange={(p) => change(() => (x.p = p))}>
              <SelectTrigger className="h-10 min-w-0 flex-1" aria-label={t("Payer")}><SelectValue /></SelectTrigger>
              <SelectContent>{everyone.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input className="h-10 w-[42%]" type="number" min="0" step="any" inputMode="decimal" value={isNum(x.amount) ? x.amount : ""} placeholder={t(b.payers.length > 1 ? "The rest" : "Full amount")} aria-label={t("Amount paid")} onChange={(e) => change(() => (x.amount = e.target.value === "" ? null : Number(e.target.value)))} />
            {b.payers.length > 1 && <Button variant="ghost" size="icon-sm" aria-label={t("Remove payer")} onClick={() => change(() => b.payers.splice(i, 1))}><X /></Button>}
          </div>
        ))}
        <Button variant="link" className="h-auto self-start p-0" onClick={() => change(() => { const used = new Set(b.payers.map((y) => y.p)); const next = everyone.find((p) => !used.has(p.id)) || everyone[0]; b.payers.push({ p: next.id, amount: null }); })}>{t("+ Add another payer")}</Button>
        <p className="text-xs text-muted-foreground">{t("Leave an amount empty and that person covers the rest.")}</p>
      </Section>

      <Section title={t("Breakdown")}>
        <div id="bPrev" className="flex flex-col gap-2">
          {r.errs.length > 0 && (
            <Alert variant="destructive" className="border-0 bg-spend/10"><AlertDescription><ul className="flex flex-col gap-1">{r.errs.map((e) => <li key={e}>{e}</li>)}</ul></AlertDescription></Alert>
          )}
          <div className="flex flex-col rounded-xl border bg-card px-3 py-1.5 text-sm">
            {lines.map(([l, v], i) => <div key={l + i} className="flex justify-between gap-2.5 py-1"><span>{l}</span><Amt className={cn(v < 0 && "text-earn")}>{i ? money(v, { sign: true }) : money(v)}</Amt></div>)}
            <div className="mt-0.5 flex justify-between gap-2.5 border-t border-foreground pt-2 pb-1 font-bold"><span>{t("Total")}</span><Amt>{money(r.total)}</Amt></div>
          </div>
          {rows.length > 0 && (
            <Table className="text-sm">
              <TableHeader><TableRow>{[t("Person"), t("Share"), t("Paid"), t("This bill")].map((h, i) => <TableHead key={h} className={cn("text-[11px] font-semibold tracking-wide text-muted-foreground uppercase", i && "text-right")}>{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const base = round(r.base[p] || 0), adj = round(r.adj[p] || 0), share = r.shares[p] || 0, paid = r.paid[p] || 0, net = round(paid - share);
                  return (
                    <TableRow key={p} className="align-top">
                      <TableCell className="whitespace-normal">{nm(p)}</TableCell>
                      <TableCell className="amt text-right">{money(share)}<small className="block text-[11px] text-muted-foreground">{money(base)}{adj ? ` ${adj > 0 ? "+" : "−"} ${money(Math.abs(adj))}` : ""}</small></TableCell>
                      <TableCell className="amt text-right">{paid ? money(paid) : "—"}</TableCell>
                      <TableCell className={cn("amt text-right", net > 0 && "text-earn", net < 0 && "text-spend")}>{Math.abs(net) < 0.01 ? t("Even") : t(net > 0 ? "gets {amt}" : "owes {amt}", { amt: money(Math.abs(net)) })}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </Section>

      <div className="flex items-center gap-2.5">
        <Checkbox id="bLog" checked={logPaid && (r.paid.me || 0) > 0} disabled={!(r.paid.me > 0)} onCheckedChange={(v) => setLogPaid(!!v)} />
        <Label htmlFor="bLog" className="text-[15px] leading-snug font-normal">
          {r.paid.me > 0 ? t("Add the {amt} I paid to my ledger", { amt: money(r.paid.me) }) : t("You didn't pay for this bill, so nothing goes into your ledger.")}
        </Label>
      </div>
      <SheetActions left={id && <ConfirmButton label={t("Delete")} confirmLabel={t("Tap again to delete")} onConfirm={() => { deleteBill(id); close(); toast(t("Bill deleted")); }} />}>
        <Button variant="outline" onClick={close}>{t("Cancel")}</Button>
        <Button onClick={save}>{t("Save")}</Button>
      </SheetActions>
    </AppSheet>
  );
}
