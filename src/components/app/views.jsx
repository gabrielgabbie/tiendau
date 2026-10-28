// The three screens: Log (quick add by chat), Ledger, Split.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowUp, Mic, Square, Loader2, ImagePlus, Plus, Folder, FolderPlus, Check, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ListFilter, Pencil, X } from "lucide-react";
import { money, compact, fmtDate, cur, balances, settlePlan, today, t, isVi } from "@/core/index.js";
import { readBill, billThumb } from "@/lib/bill-reader.js";
import { useSpeech, micPermission } from "@/lib/use-speech.js";
import { MicSheet } from "@/components/app/sheets/mic.jsx";
import { S, put, del, LS } from "@/data/store.js";
import { ui, chatLog, data, send, billDebts, payBillDebt, startBill, billProgress, finishBill, failBill, pname, billMeta, uid, bump, saveL, settings, saveSettle, deleteBill, SORTS, periodRange, periodLabel, stepPeriod, filterLabel, filterOn, clearFilter } from "@/lib/model.js";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CatBadge, CatIcon, catColor, Chip, Amt, eventTones, AppSheet, SheetActions, Section, useSheets } from "@/components/app/bits.jsx";
import { TxSheet, EventSheet } from "@/components/app/sheets/records.jsx";
import { BillSheet } from "@/components/app/sheets/bill.jsx";
import { DatePickerSheet, FilterSheet } from "@/components/app/sheets/pickers.jsx";
import { SOFT } from "@/components/app/ledger-bento.jsx";

const CardTitle = ({ children }) => <h3 className="mb-2.5 text-xs leading-none font-semibold tracking-[.08em] text-muted-foreground uppercase">{children}</h3>;
const List = ({ className, ...p }) => <Card className={cn("gap-0 divide-y divide-border/60 overflow-hidden py-0", className)} {...p} />;
const Empty = ({ children }) => <Card className="block px-4 py-7 text-center text-muted-foreground">{children}</Card>;

function useDemoGuard() {
  return () => { if (data().demo) { toast(t("That's example data. Log your own record to start.")); return true; } return false; };
}

function DemoBanner({ D }) {
  if (!D.demo) return null;
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-accent px-3 py-2.5 text-[13px]">
      <p className="flex-1"><b>{t("Example data.")}</b> {t("Your own records replace it as soon as you log one.")}</p>
      <Button variant="link" size="sm" onClick={() => put("meta", Object.assign(settings(), { hideDemo: true }))}>{t("Hide")}</Button>
    </div>
  );
}

/** A tappable row in a list: category badge, title, subtitle, amount, pencil. */
function Row({ badge, title, sub, amount, amountClass, onClick, label, soft }) {
  return (
    <button className="group flex w-full items-center gap-3 px-3.5 py-[11px] text-left hover:bg-muted/50" onClick={onClick} aria-label={label}>
      {badge}
      <span className="min-w-0 flex-1">
        <b className="block truncate font-semibold">{title}</b>
        <span className="block truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      <Amt className={cn("ml-auto", amountClass)}>{amount}</Amt>
      <span aria-hidden="true" className={cn("grid size-8 flex-none place-items-center rounded-[9px] text-muted-foreground group-hover:text-primary group-focus-visible:text-primary", soft ? "bg-muted/70" : "border bg-background group-hover:border-primary group-focus-visible:border-primary")}><Pencil className="size-4" /></span>
    </button>
  );
}

// ---------- Log ----------
const CHEAT = [
  ["phở 55k", () => t("Expense. Category is picked from the words.")],
  ["salary 25tr", () => <>{t("Income. Also")} <code className="amt text-foreground">+500k refund</code>{t(", bonus, freelance.")}</>],
  ["grab 32k yesterday", () => t("Yesterday's date. k = thousand, tr = million.")],
  ["dinner 1.2tr with An, Bình #Dalat", () => t("Shared bill split equally, grouped under an event.")],
  ["An paid taxi 300k with An, Chi", () => t("Someone else paid.")],
  ["… ship 15k · svc 5% · vat 8% · discount 30k · voucher 10% · tip 20k", () => t("Fees and discounts on a shared bill.")],
];
const EXAMPLES = ["Phở 55k, grab 32k", "Salary 25tr", "Dinner 1.2tr with An and Bình #Dalat", "Grab Food 450k with An, Chi ship 15k discount 30k"];

function ReceiptRow({ r }) {
  const { open } = useSheets();
  const o = S[r.col][r.id];
  const wrap = "flex items-center gap-2.5 border-b border-dashed py-[5px] last:border-b-0";
  const edit = (onClick, label) => <Button variant="outline" size="icon-sm" className="size-7 bg-background text-muted-foreground" aria-label={label} onClick={onClick}><Pencil /></Button>;
  if (!o) return <div className={cn(wrap, "line-through opacity-45")}><b className="font-semibold">{t("Removed")}</b></div>;
  const lbl = (t, s) => <div className="min-w-0 flex-1"><b className="font-semibold">{t}</b><span className="block text-xs text-muted-foreground">{s}</span></div>;
  const ev = o.eventId ? " · " + (S.events[o.eventId]?.name || "") : "";
  if (r.col === "tx") return <div className={wrap}><CatBadge cat={o.category} size="sm" />{lbl(o.note, `${t(o.category)} · ${fmtDate(o.date)}`)}<Amt className={o.type === "income" ? "text-earn" : "text-spend"}>{money(o.type === "income" ? o.amount : -o.amount, { sign: true })}</Amt>{edit(() => open(TxSheet, { id: o.id }), t("Edit {name}", { name: o.note }))}</div>;
  if (o.kind === "settle") return <div className={wrap}><CatBadge cat="settle" color="var(--c8)" size="sm" />{lbl(t("{from} paid {to}", { from: pname(o.paidBy), to: pname(Object.keys(o.shares)[0]) }), `${t("Settle up")}${ev}`)}<Amt>{money(o.amount)}</Amt><Button variant="link" size="sm" onClick={() => { deleteBill(o.id); toast(t("Removed")); }}>{t("Undo")}</Button></div>;
  return <div className={wrap}><CatBadge cat={o.category || "Other"} size="sm" />{lbl(o.title, billMeta(o) + ev)}<Amt>{money(o.amount)}</Amt>{edit(() => open(BillSheet, { id: o.id }), t("Edit {name}", { name: o.title }))}</div>;
}

function HowTo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Button variant="link" className="h-auto self-start p-0 text-[13px]" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronDown className={cn("transition-transform", open && "rotate-180")} />{t("How to type it")}
      </Button>
      {open && (
        <Card className="gap-0 px-3 py-1">
          {CHEAT.map(([c, d]) => (
            <div key={c} className="flex flex-col gap-0.5 border-t border-dashed py-2 text-[13px] text-muted-foreground first:border-t-0">
              <code className="amt text-[13px] font-medium [overflow-wrap:anywhere] text-foreground">{c}</code><span>{d()}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

export function ChatView({ say }) {
  if (!chatLog.length) return (
    <div className="flex flex-1 flex-col justify-end gap-4 px-0.5 pt-6 pb-2">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[30px] leading-[1.05] font-bold tracking-tight text-balance">{t("What did you spend today?")}</h2>
        <p className="max-w-[40ch] text-muted-foreground">{t("Type it or say it, like you'd text a friend. Records are added instantly and you can edit any of them after.")}</p>
      </div>
      <div className="flex flex-wrap gap-2">{EXAMPLES.map((s) => <Chip key={s} onPressedChange={() => say(s)} className="h-auto min-h-8 py-1.5 whitespace-normal">{s}</Chip>)}</div>
      <HowTo />
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5 pt-1">
      {chatLog.map((m, i) => m.role === "me"
        ? <div key={i} className="flex max-w-[86%] flex-col items-end gap-1 self-end">
            {m.image && <img src={m.image} alt={t("Bill photo")} className="max-h-56 w-auto max-w-[220px] rounded-2xl rounded-br-[5px] border object-cover" />}
            {m.text && <div className="rounded-2xl rounded-br-[5px] bg-primary px-[13px] py-[9px] break-words whitespace-pre-wrap text-primary-foreground">{m.text}</div>}
          </div>
        : m.pending
          ? <div key={i} role="status" className="flex max-w-[86%] items-center gap-2 self-start rounded-2xl rounded-bl-[5px] border bg-card px-[13px] py-[9px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />{t("Reading the bill…")}{m.progress > 0 && <Amt className="text-xs">{Math.round(m.progress * 100)}%</Amt>}
            </div>
          : <div key={i} className="contents">
              <div className="max-w-[86%] self-start rounded-2xl rounded-bl-[5px] border bg-card px-[13px] py-[9px] break-words whitespace-pre-wrap">{m.text}</div>
              {m.made?.length > 0 && <div className="receipt w-[min(100%,330px)] self-start rounded-t-[4px] rounded-b-xl border bg-card px-3 pt-3 pb-2">{m.made.map((r) => <ReceiptRow key={r.id} r={r} />)}</div>}
              {m.via && <span className="-mt-1.5 self-start px-1 text-[11px] text-muted-foreground">{t(m.via === "ai" ? "Read with AI" : "Read on this phone")}</span>}
            </div>)}
    </div>
  );
}

const SPEECH_ERRORS = {
  "audio-capture": "No microphone found.",
  "no-speech": "Didn't catch that. Tap the mic and try again.",
  network: "Voice input needs an internet connection.",
};

/** The main action: a large box to type or speak records, with a receipt scanner, mic and send. */
export function Composer({ inputRef, text, setText, onHeight }) {
  const { open } = useSheets();
  const base = useRef("");
  const root = useRef(null);
  const file = useRef(null);
  // a bill photo attached to the next message: { file, url }
  const [attached, setAttached] = useState(null);
  const update = (v) => { setText(v); LS.set("pl-draft", v); };
  const attach = (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    setAttached((a) => { if (a) URL.revokeObjectURL(a.url); return { file: f, url: URL.createObjectURL(f) }; });
    setTimeout(() => inputRef.current?.focus());
  };
  const detach = () => setAttached((a) => { if (a) URL.revokeObjectURL(a.url); return null; });
  const speech = useSpeech({
    lang: isVi() ? "vi-VN" : "en-US",
    onText: (heard) => update(base.current ? `${base.current}, ${heard}` : heard),
    onError: (code) => {
      // blocked after all (e.g. Safari, which can't report the permission ahead of time)
      if (code === "not-allowed" || code === "service-not-allowed") open(MicSheet, { state: "denied", onReady: listen });
      else toast(t(SPEECH_ERRORS[code] || "Voice input stopped. Try again."));
    },
  });
  const grow = () => { const el = inputRef.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 132) + "px"; };
  useEffect(grow, [text]);
  // the box floats over the chat, so the chat needs to know how much room to leave at the bottom
  useEffect(() => {
    const el = root.current; if (!el || !onHeight) return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    return () => { ro.disconnect(); onHeight(0); };
  }, [onHeight]);
  const sendBill = async (att, note) => {
    let id;
    try {
      id = startBill({ thumb: await billThumb(att.file), text: note });
      const bill = await readBill(att.file, (p) => billProgress(id, p));
      finishBill(id, bill, { text: note });
    } catch (err) {
      console.error(err);
      const msg = t("Couldn't read that photo. Check your connection the first time, then try again.");
      if (id) failBill(id, msg); else toast(msg);
    } finally {
      URL.revokeObjectURL(att.url);
    }
  };
  const go = () => {
    if (speech.listening) speech.stop();
    if (attached) { sendBill(attached, text); setAttached(null); update(""); return; }
    if (!text.trim()) return;
    send(text);
    update("");
  };
  const listen = () => { base.current = text.trim().replace(/,$/, ""); speech.start(); };
  const mic = async () => {
    if (speech.listening) { speech.stop(); return; }
    const state = await micPermission();
    // no voice recognition here: say why (http page, home-screen app, other browser) and offer the keyboard's mic
    if (!speech.supported) { open(MicSheet, { state: state === "insecure" ? "insecure" : "unsupported", onKeyboard: () => setTimeout(() => inputRef.current?.focus(), 350) }); return; }
    if (state === "granted") listen();
    else open(MicSheet, { state, onReady: listen, onKeyboard: () => setTimeout(() => inputRef.current?.focus(), 350) }); // explain first, then the browser's own dialog
  };
  return (
    // floats above the bottom buttons with nothing behind it; the chat scrolls underneath
    <div ref={root} className="pointer-events-none absolute inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom,0px))] flex flex-col items-stretch px-[max(12px,env(safe-area-inset-left,0px))]">
      <p className={cn("pointer-events-auto mb-1.5 self-start rounded-full bg-card/90 px-3 py-1 text-xs font-medium text-spend shadow-sm backdrop-blur", !speech.listening && "sr-only")} role="status">{speech.listening ? t("Listening… tap the red button when you're done.") : ""}</p>
      <div className={cn("pointer-events-auto flex flex-col rounded-[28px] border bg-card p-1.5 shadow-lg shadow-black/10 transition-shadow focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-ring/25", speech.listening && "border-primary ring-[3px] ring-ring/30")}>
        {attached && (
          // the attached bill photo, sent with the next message
          <div className="relative mx-2 mt-1.5 mb-1 self-start">
            <img src={attached.url} alt={t("Bill photo")} className="h-20 w-auto max-w-40 rounded-[12px] border object-cover" />
            <button type="button" onClick={detach} aria-label={t("Remove photo")}
              className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-foreground text-background shadow ring-2 ring-card"><X className="size-3.5" strokeWidth={2.5} /></button>
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <Button type="button" variant="ghost" size="icon" className="size-12 flex-none rounded-full text-muted-foreground" aria-label={t("Add a bill photo")} title={t("Add a bill photo")} onClick={() => file.current.click()}>
            <ImagePlus className="size-[22px]" />
          </Button>
          <input ref={file} type="file" accept="image/*" hidden onChange={attach} />
          <Textarea
            ref={inputRef}
            rows={1}
            value={text}
            placeholder={speech.listening ? t("Listening… say “phở 55 nghìn”") : attached ? t("Note (optional)") : t("e.g. lunch 65k, grab 32k")}
            aria-label={t("Log something")}
            className="max-h-[132px] min-h-12 flex-1 resize-none border-0 bg-transparent px-0 py-3 text-base leading-[1.35] shadow-none focus-visible:ring-0 dark:bg-transparent"
            onChange={(e) => update(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } }}
          />
          <Button
            type="button"
            variant={speech.listening ? "destructive" : "secondary"}
            size="icon"
            className={cn("relative size-12 flex-none rounded-full", speech.listening && "bg-spend text-white hover:bg-spend/90 dark:bg-spend")}
            aria-label={speech.listening ? t("Stop listening") : t("Speak")}
            aria-pressed={speech.listening}
            onClick={mic}
          >
            {speech.listening && <span className="absolute inset-0 animate-ping rounded-full bg-spend/40 motion-reduce:hidden" aria-hidden="true" />}
            {speech.listening ? <Square className="size-4 fill-current" /> : <Mic className="size-[22px]" />}
          </Button>
          <Button size="icon" className="size-12 flex-none rounded-full" aria-label={t("Send")} disabled={!text.trim() && !attached} onClick={go}><ArrowUp className="size-[22px]" strokeWidth={2.4} /></Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Ledger ----------
/** Where the money went: a ranked horizontal bar chart, one bar per category.
 *  Bars share one colour (the name carries identity); tap a bar to filter the list to it. */
function SpendBars({ cats, total, selected, dim, onPick }) {
  const max = cats[0][1];
  return (
    <div className={cn(SOFT, "p-3.5")}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] text-muted-foreground">{t("Where it went")}</h3>
        <span className="text-[11px] text-muted-foreground">{t("Tap a bar to filter")}</span>
      </div>
      <ul className="flex flex-col gap-1" aria-label={t("Spending by category")}>
        {cats.map(([c, v]) => {
          const share = (v / total) * 100, pct = share > 0 && share < 1 ? "<1" : Math.round(share), on = selected === c, faded = dim(c);
          return (
            <li key={c}><button aria-pressed={on} onClick={() => onPick(c)}
              aria-label={`${t(c)}: ${money(v)}, ${pct}%`} title={`${t(c)}: ${money(v)} · ${pct}%`}
              className={cn("group grid w-full grid-cols-[6.75rem_1fr] items-center gap-3 rounded-[6px] py-1.5 pr-1 pl-1 text-left hover:bg-muted/60", on && "bg-accent hover:bg-accent")}>
              <span className={cn("flex min-w-0 items-center gap-1.5 text-[13px]", faded && "text-muted-foreground")}>
                <CatIcon cat={c} className="size-3.5 flex-none text-muted-foreground" /><span className="truncate">{t(c)}</span>
              </span>
              <span className="flex min-w-0 items-center gap-2">
                {/* bar grows from the left baseline; its far end is rounded; room is left for the value at its tip */}
                <i className={cn("block h-3 min-w-[3px] rounded-r-[4px] transition-colors", faded ? "bg-muted-foreground/25" : "bg-primary")}
                  style={{ width: `calc((100% - 5.5rem) * ${v / max})` }} />
                <span className="amt text-[12px] whitespace-nowrap text-muted-foreground">
                  <span className={cn(!faded && "text-foreground")}>{compact(v)}</span> · {pct}%
                </span>
              </span>
            </button></li>
          );
        })}
      </ul>
    </div>
  );
}

export function LedgerView({ D }) {
  const { open } = useSheets();
  const guard = useDemoGuard();
  const L = ui.L; const [from, to] = periodRange(); const label = periodLabel();
  const inPeriod = Object.values(D.tx).filter((x) => x.date && x.date >= from && x.date <= to);
  // breakdown always covers the whole period so it doubles as a category picker
  let pExp = 0; const byCat = {};
  inPeriod.forEach((x) => { if (x.type !== "income") { pExp += x.amount; byCat[x.category] = (byCat[x.category] || 0) + x.amount; } });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const match = (x) => (L.type === "all" || (L.type === "income") === (x.type === "income")) && (!L.cats.length || L.cats.includes(x.category));
  const txs = inPeriod.filter(match);
  let inc = 0, exp = 0; txs.forEach((x) => (x.type === "income" ? (inc += x.amount) : (exp += x.amount)));
  const signed = (x) => (x.type === "income" ? x.amount : -x.amount);
  const byDate = (a, b) => (a.date + String(a.createdAt || 0).padStart(15, "0")).localeCompare(b.date + String(b.createdAt || 0).padStart(15, "0"));
  const sorters = { "date-desc": (a, b) => byDate(b, a), "date-asc": byDate, "amt-desc": (a, b) => b.amount - a.amount || byDate(b, a), "amt-asc": (a, b) => a.amount - b.amount || byDate(b, a) };
  txs.sort(sorters[L.sort] || sorters["date-desc"]);
  const byDay = L.sort.startsWith("date") && L.period !== "day";
  const filtered = filterOn();
  const dim = (c) => filtered && (L.type === "income" || (L.cats.length && !L.cats.includes(c)));
  const editTx = (x) => { if (guard()) return; open(TxSheet, { id: x.id }); };
  const row = (x, showDate) => (
    <Row key={x.id} badge={<CatBadge cat={x.category} soft />} title={x.note}
      sub={`${t(x.category)}${showDate ? " · " + fmtDate(x.date, true) : ""}${x.billId ? " · " + t(D.bills[x.billId]?.kind === "settle" ? "Settle up" : "split bill") : ""}`}
      amount={money(signed(x), { sign: true })} amountClass={x.type === "income" ? "text-earn" : "text-spend"}
      label={t("Edit {name}", { name: `${x.note}, ${money(x.amount)}` })} onClick={() => editTx(x)} soft />
  );
  const onlyCat = (c) => { const on = L.cats.length === 1 && L.cats[0] === c; L.cats = on ? [] : [c]; if (!on) L.type = "all"; saveL(); bump(); };

  let list;
  if (!txs.length) list = <Empty>{filtered ? <>{t("Nothing matches “{filter}” in {period}.", { filter: filterLabel(), period: label })} <Button variant="link" className="h-auto p-0" onClick={clearFilter}>{t("Clear filter")}</Button></> : t("Nothing logged in {period}. Switch to Log and type something like “coffee 45k”.", { period: label })}</Empty>;
  else if (byDay) {
    const days = []; const idx = {};
    txs.forEach((x) => { if (!(x.date in idx)) { idx[x.date] = days.length; days.push([x.date, []]); } days[idx[x.date]][1].push(x); });
    list = days.map(([d, l]) => (
      <section key={d} className="flex flex-col">
        <h4 className="mx-0.5 my-1.5 flex justify-between text-xs font-semibold text-muted-foreground"><span>{fmtDate(d, L.period !== "month")}</span><Amt>{money(l.reduce((a, x) => a + signed(x), 0), { sign: true })}</Amt></h4>
        <List className={SOFT}>{l.map((x) => row(x, false))}</List>
      </section>
    ));
  } else list = <List className={SOFT}>{txs.map((x) => row(x, L.period !== "day"))}</List>;
  const stepper = L.period !== "range";

  return (
    <div className="flex flex-col gap-3.5">
      <DemoBanner D={D} />
      <div className="flex items-center gap-2">
        {stepper && <Button variant="ghost" size="icon" className={cn(SOFT, "size-[38px] rounded-full")} aria-label={t("Previous")} onClick={() => stepPeriod(-1)}><ChevronLeft /></Button>}
        <Button variant="ghost" className="h-auto min-w-0 flex-1 gap-1.5 px-2 py-1.5 font-display text-xl font-bold" aria-label={t("Change dates")} onClick={() => open(DatePickerSheet, {})}>
          <CalendarDays className="size-[18px]" /><span className="truncate">{label}</span><ChevronDown className="size-4 text-muted-foreground" />
        </Button>
        {stepper && <Button variant="ghost" size="icon" className={cn(SOFT, "size-[38px] rounded-full")} aria-label={t("Next")} onClick={() => stepPeriod(1)}><ChevronRight /></Button>}
      </div>
      <div className={cn(SOFT, "grid grid-cols-3 divide-x divide-border/60")}>
        {[[t("Spent"), money(exp), "text-spend"], [t("Income"), money(inc), "text-earn"], [t("Net"), money(inc - exp, { sign: true }), ""]].map(([k, v, c]) => (
          <div key={k} className="flex min-w-0 flex-col gap-1 px-2.5 py-3">
            <span className="text-[13px] text-muted-foreground">{k}</span>
            {/* keep the number whole; only the currency symbol may wrap */}
            <Amt className={cn("text-[14px] leading-tight", c)}><span className="whitespace-nowrap">{v.replace(cur().sym, "").trim()}</span> {cur().sym}</Amt>
          </div>
        ))}
      </div>
      {cats.length > 0 && <SpendBars cats={cats} total={pExp} selected={L.cats.length === 1 ? L.cats[0] : null} dim={dim} onPick={onlyCat} />}
      <div className="flex items-center gap-2">
        <div className={cn(SOFT, "flex h-9 min-w-0 flex-1 items-center text-sm font-semibold", filtered && "bg-accent text-primary dark:bg-accent")}>
          <button className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2.5" onClick={() => open(FilterSheet, {})}>
            <ListFilter className="size-[15px] flex-none" /><span className="truncate">{filterLabel()}</span>
            {!filtered && <ChevronDown className="ml-auto size-3.5 flex-none text-muted-foreground" />}
          </button>
          {filtered && <button className="grid h-full place-items-center px-2" aria-label={t("Clear filter")} onClick={clearFilter}><X className="size-4" /></button>}
        </div>
        <Select value={L.sort} onValueChange={(v) => { L.sort = v; saveL(); bump(); }}>
          <SelectTrigger className={cn(SOFT, "w-auto font-semibold")} aria-label={t("Sort records")}><SelectValue /></SelectTrigger>
          <SelectContent align="end">{Object.entries(SORTS).map(([k, v]) => <SelectItem key={k} value={k}>{t(v)}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" className="h-9 rounded-[8px]" aria-label={t("Add record")} onClick={() => open(TxSheet, {})}>{t("Add")}</Button>
      </div>
      <p className="mx-0.5 -mt-1 text-xs text-muted-foreground">{t("{n} records", { n: txs.length })}</p>
      {list}
    </div>
  );
}

// ---------- Split ----------
/** Who owes whom within `scope` ("all" or an event id), with the headline for you. */
function BalanceCard({ D, scope, title }) {
  const net = balances(D, scope);
  const mine = net.me || 0, tiny = cur().dec ? 0.01 : 1;
  const head = Math.abs(mine) < tiny ? t("You're all square") : mine > 0 ? t("You're owed {amt}", { amt: money(mine) }) : t("You owe {amt}", { amt: money(-mine) });
  const others = Object.entries(net).filter(([p, v]) => p !== "me" && Math.abs(v) >= tiny).sort((a, b) => b[1] - a[1]);
  return (
    <div className={cn(SOFT, "flex flex-col gap-2.5 p-3.5")}>
      <span className="text-[13px] text-muted-foreground">{title}</span>
      <p className={cn("font-display text-2xl leading-[1.15] font-bold tracking-tight", mine > 0 && "text-earn", mine < 0 && "text-spend")}>{head}</p>
      {others.length > 0 && (
        <div className="flex flex-col">
          {others.map(([p, v]) => (
            <div key={p} className="flex items-center gap-2.5 border-t border-border/60 py-2">
              <Avatar className="size-[30px]"><AvatarFallback className="text-[13px] font-semibold">{pname(p, D)[0]}</AvatarFallback></Avatar>
              <span className="min-w-0 flex-1">{pname(p, D)}</span>
              <Amt className={v > 0 ? "text-earn" : "text-spend"}>{t(v > 0 ? "gets back {amt}" : "owes {amt}", { amt: money(Math.abs(v)) })}</Amt>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Suggested payments to settle `scope`; "Mark paid" records one. */
function SettleCard({ D, scope }) {
  const guard = useDemoGuard();
  const plan = settlePlan(balances(D, scope));
  if (!plan.length) return null;
  const settle = (p) => {
    if (guard()) return;
    saveSettle({ id: uid(), kind: "settle", title: t("Settle up"), amount: p.amount, paidBy: p.from, shares: { [p.to]: p.amount }, eventId: scope === "all" ? null : scope, date: today(), createdAt: Date.now() });
    toast(p.to === "me" ? t("Added {amt} to your income", { amt: money(p.amount) }) : p.from === "me" ? t("Added {amt} to your spending", { amt: money(p.amount) }) : t("Marked as paid"));
  };
  return (
    <div className={cn(SOFT, "p-3.5")}>
      <span className="text-[13px] text-muted-foreground">{t("Settle up")}</span>
      {plan.map((p) => (
        <div key={p.from + p.to} className="mt-2 flex items-center gap-2 border-t border-border/60 pt-2 text-sm">
          <p className="min-w-0 flex-1"><b>{pname(p.from, D)}</b> {t(p.from === "me" ? "pay" : "pays")} <b>{pname(p.to, D)}</b> <Amt>{money(p.amount)}</Amt></p>
          <Button variant="outline" size="sm" onClick={() => settle(p)}>{t("Mark paid")}</Button>
        </div>
      ))}
    </div>
  );
}

const byNewest = (a, b) => (b.date + (b.createdAt || 0)).localeCompare(a.date + (a.createdAt || 0));
const settleRow = (b, D, onClick) => (
  <Row key={b.id} badge={<CatBadge cat="settle" color="var(--c8)" soft />} title={t("{from} paid {to}", { from: pname(b.paidBy, D), to: pname(Object.keys(b.shares)[0], D) })}
    sub={`${t("Settle up")} · ${fmtDate(b.date)}`} amount={money(b.amount)} label={t("Edit payment")} onClick={onClick} soft />
);

/** The event page's header, in the same folder look as its card: a tab, a tinted body, name, date and total. */
function EventHeader({ ev, sub }) {
  const [deep, light] = eventTones(ev);
  return (
    <div className="relative pt-3">
      <span aria-hidden="true" className="absolute top-0 left-0 h-5 w-[38%] rounded-t-[8px]" style={{ background: `color-mix(in oklab, ${light} 75%, ${deep})` }} />
      <div className="relative flex flex-col gap-1 rounded-[8px] rounded-tl-none p-4" style={{ background: `color-mix(in oklab, ${light} 55%, var(--card))` }}>
        <span className="flex min-w-0 items-center gap-2">
          <Folder className="size-5 flex-none" style={{ color: deep }} strokeWidth={2} />
          <h2 className="truncate font-display text-2xl leading-tight font-bold">{ev.name}</h2>
        </span>
        <span className="text-[13px] text-foreground/70">{sub}</span>
      </div>
    </div>
  );
}

/** An event on the Split overview, drawn as a folder. */
function EventCard({ D, ev, onOpen }) {
  const bills = Object.values(D.bills).filter((b) => b.eventId === ev.id && b.kind === "bill");
  const total = bills.reduce((a, b) => a + b.amount, 0);
  const mine = balances(D, ev.id).me || 0, tiny = cur().dec ? 0.01 : 1;
  const [deep, light] = eventTones(ev);
  return (
    // a folder: a small tab on top, a tinted body holding the event
    <button onClick={onOpen} className="group relative min-w-0 pt-2.5 text-left transition-transform active:scale-[0.98]" aria-label={t("Open {name}", { name: ev.name })}>
      <span aria-hidden="true" className="absolute top-0 left-0 h-4 w-[42%] rounded-t-[8px]" style={{ background: `color-mix(in oklab, ${light} 75%, ${deep})` }} />
      <span className="relative flex min-h-[86px] flex-col justify-between gap-2 rounded-[8px] rounded-tl-none p-3 shadow-[0_10px_24px_-18px_rgb(0_0_0/0.45)]" style={{ background: `color-mix(in oklab, ${light} 55%, var(--card))` }}>
        <span className="flex min-w-0 items-center gap-1.5">
          <Folder className="size-4 flex-none" style={{ color: deep }} strokeWidth={2} />
          <b className="truncate text-[15px] leading-tight font-semibold">{ev.name}</b>
        </span>
        <span className="flex min-w-0 items-center justify-between gap-1.5">
          <Amt className="truncate text-[13px] text-foreground/75" title={money(total)}>{compact(total)}</Amt>
          {Math.abs(mine) >= tiny && <span className={cn("flex-none rounded-full bg-card/80 px-1.5 py-px text-[11px] font-medium", mine > 0 ? "text-earn" : "text-spend")}>{t(mine > 0 ? "you get {amt}" : "you owe {amt}", { amt: compact(Math.abs(mine)) })}</span>}
        </span>
      </span>
    </button>
  );
}

/** One bill with its breakdown: who paid and each person's share. */
function BillCard({ D, b, onOpen }) {
  const shares = Object.entries(b.shares || {}).sort((x, y) => (x[0] === "me" ? -1 : y[0] === "me" ? 1 : y[1] - x[1]));
  const debts = billDebts(D, b);
  return (
    <button onClick={onOpen} className={cn(SOFT, "flex w-full flex-col gap-2.5 p-3.5 text-left")} aria-label={t("See {name}", { name: b.title })}>
      <span className="flex items-center gap-3">
        <CatBadge cat={b.category || "Other"} soft />
        <span className="min-w-0 flex-1">
          <b className="block truncate font-semibold">{b.title}</b>
          <span className="block truncate text-xs text-muted-foreground">{fmtDate(b.date)} · {billMeta(b, D)}</span>
        </span>
        <Amt>{money(b.amount)}</Amt>
      </span>
      <span className="flex flex-wrap gap-1.5">
        {shares.map(([p, v]) => {
          const owes = debts.filter((d) => d.from === p);
          const done = owes.length > 0 && owes.every((d) => d.paid >= d.amount);
          return (
            <span key={p} className={cn("inline-flex items-baseline gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs", p === "me" && "bg-accent text-accent-foreground", done && "bg-earn/12 text-earn")}>
              <span>{pname(p, D)}</span><Amt className="text-[11px]">{compact(v)}</Amt>
              {done && <Check className="size-3 self-center" strokeWidth={3} aria-label={t("paid back")} />}
            </span>
          );
        })}
      </span>
    </button>
  );
}

/** One shared bill: who paid, each person's share, who owes whom and whether they've paid it back. */
function BillDetailSheet({ id, ...sheet }) {
  const { open, close } = useSheets();
  const guard = useDemoGuard();
  const D = data(), b = D.bills[id];
  if (!b) return null;
  const debts = billDebts(D, b);
  const payers = Object.entries(b.paid || { [b.paidBy]: b.amount }).filter(([, v]) => v > 0);
  const shares = Object.entries(b.shares || {}).sort((x, y) => (x[0] === "me" ? -1 : y[0] === "me" ? 1 : y[1] - x[1]));
  const ev = b.eventId && D.events[b.eventId];
  const pay = (d) => {
    if (guard()) return;
    const left = d.amount - d.paid;
    payBillDebt(b, d);
    toast(d.to === "me" ? t("Added {amt} to your income", { amt: money(left) }) : d.from === "me" ? t("Added {amt} to your spending", { amt: money(left) }) : t("Marked as paid"));
  };
  const edit = () => { if (guard()) return; close(); setTimeout(() => open(BillSheet, { id })); };
  const sentence = (d) => d.from === "me" ? t("You owe {name}", { name: pname(d.to, D) }) : d.to === "me" ? t("{name} owes you", { name: pname(d.from, D) }) : t("{from} owes {to}", { from: pname(d.from, D), to: pname(d.to, D) });
  return (
    <AppSheet {...sheet} title={b.title}>
      <div className="flex items-end justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">{[fmtDate(b.date, true), t(b.category || "Other"), ev && ev.name].filter(Boolean).join(" · ")}</span>
        <Amt className="text-2xl font-semibold">{money(b.amount)}</Amt>
      </div>
      <p className="text-sm">{t("Paid by {names}", { names: payers.map(([p, v]) => payers.length > 1 ? `${pname(p, D)} (${compact(v)})` : pname(p, D)).join(", ") })}</p>

      <Section title={t("Who owes")}>
        {debts.length === 0 && <p className="text-sm text-muted-foreground">{t("Nobody owes anything on this bill.")}</p>}
        <div className="flex flex-col gap-2">
          {debts.map((d) => {
            const done = d.paid >= d.amount;
            return (
              <div key={d.from + d.to} className={cn(SOFT, "flex items-center gap-3 p-3")}>
                <Avatar className="size-9"><AvatarFallback className="text-sm font-semibold">{pname(d.from === "me" ? d.to : d.from, D)[0]}</AvatarFallback></Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{sentence(d)}</span>
                  <Amt className={cn("block text-base font-semibold", done ? "text-muted-foreground line-through" : d.to === "me" ? "text-earn" : "text-spend")}>{money(d.amount)}</Amt>
                  {!done && d.paid > 0 && <span className="block text-xs text-muted-foreground">{t("{amt} paid, {left} left", { amt: compact(d.paid), left: compact(d.amount - d.paid) })}</span>}
                </span>
                {done
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-earn/12 px-2.5 py-1 text-xs font-semibold text-earn"><Check className="size-3.5" strokeWidth={3} />{t("Paid back")}</span>
                  : <Button size="sm" variant={d.to === "me" ? "default" : "outline"} onClick={() => pay(d)}>{t(d.from === "me" ? "I paid" : "Mark paid")}</Button>}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title={t("Shares")}>
        <List className={SOFT}>
          {shares.map(([p, v]) => (
            <div key={p} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
              <span>{pname(p, D)}</span><Amt>{money(v)}</Amt>
            </div>
          ))}
        </List>
      </Section>

      <SheetActions>
        <Button variant="outline" onClick={close}>{t("Close")}</Button>
        <Button variant="secondary" onClick={edit}><Pencil />{t("Edit")}</Button>
      </SheetActions>
    </AppSheet>
  );
}

/** One tappable line: your balance in `scope`, the people involved, and a way into the details. */
function BalanceSummary({ D, scope, title, onOpen }) {
  const net = balances(D, scope);
  const mine = net.me || 0, tiny = cur().dec ? 0.01 : 1;
  const square = Math.abs(mine) < tiny;
  const others = Object.entries(net).filter(([p, v]) => p !== "me" && Math.abs(v) >= tiny);
  const Comp = others.length ? "button" : "div";
  return (
    <Comp onClick={others.length ? onOpen : undefined} className={cn(SOFT, "flex w-full items-center gap-3 p-3.5 text-left")}
      aria-label={others.length ? t("{title}: {balance}, see details", { title, balance: `${t(mine > 0 ? "You're owed" : "You owe")} ${money(Math.abs(mine))}` }) : undefined}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-muted-foreground">{square ? title : t(mine > 0 ? "You're owed" : "You owe")}</span>
        <span className={cn("block truncate font-display text-xl leading-tight font-bold tracking-tight", mine > 0 && "text-earn", mine < 0 && "text-spend")}>{square ? t("You're all square") : money(Math.abs(mine))}</span>
      </span>
      {others.length > 0 && <>
        <span className="flex -space-x-2" aria-hidden="true">
          {others.slice(0, 3).map(([p]) => <Avatar key={p} className="size-8 ring-2 ring-card"><AvatarFallback className="text-xs font-semibold">{pname(p, D)[0]}</AvatarFallback></Avatar>)}
          {others.length > 3 && <Avatar className="size-8 ring-2 ring-card"><AvatarFallback className="text-[11px]">+{others.length - 3}</AvatarFallback></Avatar>}
        </span>
        <ChevronRight className="size-5 flex-none text-muted-foreground" />
      </>}
    </Comp>
  );
}

/** Who owes whom and the suggested payments, for `scope`, in a sheet. */
function BalanceSheet({ scope, title, ...sheet }) {
  const D = data();
  return (
    <AppSheet {...sheet} title={title}>
      <BalanceCard D={D} scope={scope} title={t("Who owes whom")} />
      <SettleCard D={D} scope={scope} />
    </AppSheet>
  );
}

export function SplitView({ D }) {
  const { open } = useSheets();
  const guard = useDemoGuard();
  if (ui.event !== "all" && !D.events[ui.event]) ui.event = "all";
  const go = (e) => { ui.event = e; document.querySelector("main")?.scrollTo({ top: 0 }); bump(); };
  const editBill = (b) => { if (guard()) return; open(BillSheet, { id: b.id }); };
  const viewBill = (b) => open(BillDetailSheet, { id: b.id });
  const allBills = Object.values(D.bills);
  const addBill = <Button className="h-11 flex-1" onClick={() => open(BillSheet, {})}><Plus />{t("Add shared bill")}</Button>;

  // ---- one event: cover, your balance, add a bill, then its bills broken down ----
  const ev = D.events[ui.event];
  if (ev) {
    const bills = allBills.filter((b) => b.eventId === ev.id).sort(byNewest);
    const total = bills.filter((b) => b.kind === "bill").reduce((a, b) => a + b.amount, 0);
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Button variant="ghost" className="-ml-2 gap-1 px-2" onClick={() => go("all")}><ChevronLeft />{t("All events")}</Button>
          {!D.demo && <Button variant="ghost" size="sm" onClick={() => open(EventSheet, { id: ev.id })}><Pencil />{t("Edit event")}</Button>}
        </div>
        <EventHeader ev={ev} sub={[ev.date && fmtDate(ev.date, true), t("{amt} total", { amt: money(total) })].filter(Boolean).join(" · ")} />
        <BalanceSummary D={D} scope={ev.id} title={t("In this event")} onOpen={() => open(BalanceSheet, { scope: ev.id, title: ev.name })} />
        <div className="flex">{addBill}</div>
        {bills.length > 0 && <h3 className="mt-1 text-[13px] text-muted-foreground">{t("{n} bills", { n: bills.filter((b) => b.kind === "bill").length })}</h3>}
        {bills.length
          ? <div className="flex flex-col gap-2">{bills.map((b) => b.kind === "settle" ? <List key={b.id} className={SOFT}>{settleRow(b, D, () => editBill(b))}</List> : <BillCard key={b.id} D={D} b={b} onOpen={() => viewBill(b)} />)}</div>
          : <Empty>{t("No bills in this event yet. Add one, or type “dinner 1.2tr with An #{tag}” in Log.", { tag: ev.name.replace(/\s+/g, "") })}</Empty>}
      </div>
    );
  }

  // ---- overview: your balance in one line, the main actions, then events and other bills ----
  const evs = Object.values(D.events).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const loose = allBills.filter((b) => !b.eventId).sort(byNewest);
  return (
    <div className="flex flex-col gap-3">
      <DemoBanner D={D} />
      <BalanceSummary D={D} scope="all" title={t("All shared bills")} onOpen={() => open(BalanceSheet, { scope: "all", title: t("All shared bills") })} />
      <div className="flex gap-2">
        {addBill}
        <Button variant="outline" className="h-11" onClick={() => open(EventSheet, {})}><Plus />{t("Event")}</Button>
      </div>
      <h3 className="mt-2 text-[13px] text-muted-foreground">{t("Events")}</h3>
      {evs.length
        ? <div className="grid grid-cols-2 gap-2.5">{evs.map((e) => <EventCard key={e.id} D={D} ev={e} onOpen={() => go(e.id)} />)}</div>
        : <button onClick={() => open(EventSheet, {})} className="flex items-center gap-3 rounded-[8px] border-[1.5px] border-dashed border-foreground/15 p-4 text-left text-sm text-muted-foreground hover:bg-muted/50">
            <FolderPlus className="size-6 flex-none" strokeWidth={1.5} />{t("Make an event for a trip, a party or a shared house")}
          </button>}
      {loose.length > 0 && <>
        <h3 className="mt-2 text-[13px] text-muted-foreground">{t("Bills without an event")}</h3>
        <div className="flex flex-col gap-2">{loose.map((b) => b.kind === "settle" ? <List key={b.id} className={SOFT}>{settleRow(b, D, () => editBill(b))}</List> : <BillCard key={b.id} D={D} b={b} onOpen={() => viewBill(b)} />)}</div>
      </>}
    </div>
  );
}
