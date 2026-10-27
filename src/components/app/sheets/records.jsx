// Sheets that edit a single record: a spending/income record, a settle-up payment, an event.
import { useState } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { EXP_CATS, INC_CATS, round, today, money, fmtDate, t as tr } from "@/core/index.js";
import { S, put, del } from "@/data/store.js";
import { uid, ui, settings, pname, bump, deleteBill } from "@/lib/model.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppSheet, SheetActions, Field, Segmented, ConfirmButton, Amt, CatIcon, catColor, DateField, useSheets } from "@/components/app/bits.jsx";
import { BillSheet } from "./bill.jsx";

export function CategorySelect({ id, value, onChange, cats }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="data-[size=default]:h-10 w-full"><SelectValue /></SelectTrigger>
      <SelectContent>{cats.map((c) => <SelectItem key={c} value={c}><CatIcon cat={c} className="size-4" style={{ color: catColor(c) }} />{tr(c)}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function TxSheet({ id, ...sheet }) {
  const { open, close } = useSheets();
  const t = id ? S.tx[id] : { type: "expense", amount: "", category: "Food & Drinks", note: "", date: today() };
  const [type, setType] = useState(t?.type || "expense");
  const [amount, setAmount] = useState(String(t?.amount ?? ""));
  const [note, setNote] = useState(t?.note || "");
  const [category, setCategory] = useState(t?.category || "Food & Drinks");
  const [date, setDate] = useState(t?.date || today());
  if (!t) return null;
  const cats = type === "income" ? INC_CATS : EXP_CATS;

  const save = () => {
    const a = round(parseFloat(amount));
    if (!(a > 0)) { toast(tr("Enter an amount above zero.")); return; }
    put("tx", Object.assign({}, t, { id: id || uid(), type, amount: a, category, note: note.trim() || tr(category), date: date || today(), createdAt: t.createdAt || Date.now() }));
    close(); toast(tr("Saved"));
  };
  const remove = () => {
    if (t.billId && S.bills[t.billId]) { const b = Object.assign({}, S.bills[t.billId]); b.linkedTx = null; put("bills", b); }
    del("tx", id); close(); toast(tr("Deleted"));
  };

  return (
    <AppSheet {...sheet} title={tr(id ? "Edit record" : "New record")}>
      <Segmented label={tr("Type")} value={type} onChange={(v) => { setType(v); setCategory((v === "income" ? INC_CATS : EXP_CATS)[0]); }} options={[["expense", tr("Expense")], ["income", tr("Income")]]} />
      <Field label={tr("Amount ({cur})", { cur: settings().currency })} htmlFor="txAmt">
        <Input id="txAmt" className="h-10" type="number" inputMode="decimal" min="0" step="any" value={amount} disabled={!!t.billId} onChange={(e) => setAmount(e.target.value)} autoFocus={!id} />
      </Field>
      <Field label={tr("Note")} htmlFor="txNote"><Input id="txNote" className="h-10" value={note} placeholder={tr("What was it?")} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label={tr("Category")} htmlFor="txCat"><CategorySelect id="txCat" value={cats.includes(category) ? category : cats[0]} onChange={setCategory} cats={cats} /></Field>
        <Field label={tr("Date")} htmlFor="txDate"><DateField id="txDate" value={date} onChange={setDate} /></Field>
      </div>
      {t.billId && (
        <div className="flex items-center justify-between gap-2.5 rounded-lg bg-muted px-3 py-2.5">
          <p className="text-xs text-muted-foreground">{tr(S.bills[t.billId]?.kind === "settle" ? "This comes from a settle-up payment, so the amount follows the payment." : "This is what you paid for a shared bill, so the amount follows the bill.")}</p>
          {S.bills[t.billId]?.kind === "bill" && <Button variant="outline" size="sm" onClick={() => open(BillSheet, { id: t.billId })}><Pencil />{tr("Edit the bill")}</Button>}
        </div>
      )}
      <SheetActions left={id && <ConfirmButton label={tr("Delete")} confirmLabel={tr("Tap again to delete")} onConfirm={remove} />}>
        <Button variant="outline" onClick={close}>{tr("Cancel")}</Button>
        <Button onClick={save}>{tr("Save")}</Button>
      </SheetActions>
    </AppSheet>
  );
}

export function SettleSheet({ b, ...sheet }) {
  const { close } = useSheets();
  const to = Object.keys(b.shares)[0];
  return (
    <AppSheet {...sheet} title={tr("Settle-up payment")}>
      <p>{tr("{from} paid {to}", { from: pname(b.paidBy), to: pname(to) })} <Amt>{money(b.amount)}</Amt> · {fmtDate(b.date)}</p>
      <SheetActions left={<Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => { deleteBill(b.id); close(); toast(tr("Payment removed")); }}>{tr("Delete payment")}</Button>}>
        <Button variant="outline" onClick={close}>{tr("Close")}</Button>
      </SheetActions>
    </AppSheet>
  );
}

export function EventSheet({ id, ...sheet }) {
  const { close } = useSheets();
  const e = id ? S.events[id] : { name: "", date: today() };
  const [name, setName] = useState(e?.name || "");
  const [date, setDate] = useState(e?.date || today());
  if (!e) return null;
  const save = () => {
    const n = name.trim(); if (!n) { toast(tr("Give the event a name.")); return; }
    const { photo, ...rest } = e; // events no longer carry a cover photo
    const ev = Object.assign({}, rest, { id: id || uid(), name: n, date: date || today() });
    put("events", ev); ui.event = ev.id; bump(); close();
  };
  const remove = () => {
    Object.values(S.bills).filter((b) => b.eventId === id).forEach((b) => put("bills", Object.assign({}, b, { eventId: null })));
    del("events", id); ui.event = "all"; bump(); close();
  };
  return (
    <AppSheet {...sheet} title={tr(id ? "Edit event" : "New event")}>
      <Field label={tr("Name")} htmlFor="eName"><Input id="eName" className="h-10" value={name} placeholder={tr("Đà Lạt trip, Team lunch…")} onChange={(ev) => setName(ev.target.value)} autoFocus /></Field>
      <Field label={tr("Start date")} htmlFor="eDate"><DateField id="eDate" value={date} onChange={setDate} /></Field>
      {id && <p className="text-xs text-muted-foreground">{tr("Deleting an event keeps its bills; they move to “No event”.")}</p>}
      <SheetActions left={id && <ConfirmButton label={tr("Delete")} confirmLabel={tr("Tap again to delete")} onConfirm={remove} />}>
        <Button variant="outline" onClick={close}>{tr("Cancel")}</Button>
        <Button onClick={save}>{tr("Save")}</Button>
      </SheetActions>
    </AppSheet>
  );
}
