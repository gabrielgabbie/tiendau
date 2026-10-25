// Ledger pickers. Dates: "Specific" picks a day, month or year; "Range" picks a start and end date.
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EXP_CATS, INC_CATS, pad, ymd, today, fmtLong, ymLabel, ymAdd, monthsShort, compact, money, t, getLang } from "@/core/index.js";
import { vi, enGB } from "react-day-picker/locale";
import { ui, saveL, bump, data, periodRange, spentBy, clearFilter } from "@/lib/model.js";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { AppSheet, SheetActions, Segmented, Chip, CatBadge, Amt, useSheets } from "@/components/app/bits.jsx";

const toDate = (s) => (s ? new Date(s + "T00:00") : undefined);
const monthOf = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1);

function NavHead({ label, onStep }) {
  return (
    <div className="flex items-center justify-between">
      <Button variant="outline" size="icon" className="rounded-full" aria-label={t("Previous")} onClick={() => onStep(-1)}><ChevronLeft /></Button>
      <b className="font-display text-[17px]">{label}</b>
      <Button variant="outline" size="icon" className="rounded-full" aria-label={t("Next")} onClick={() => onStep(1)}><ChevronRight /></Button>
    </div>
  );
}

/** Month view built on shadcn Calendar; days with spending get a dot. */
function MonthCalendar({ view, setView, marks, ...props }) {
  const has = Object.keys(marks).map(toDate);
  return (
    <div className="flex flex-col gap-1">
      <NavHead label={ymLabel(view)} onStep={(n) => setView(ymAdd(view, n))} />
      <Calendar
        {...props}
        month={monthOf(view)}
        onMonthChange={(d) => setView(ymd(d).slice(0, 7))}
        locale={getLang() === "vi" ? vi : enGB}
        weekStartsOn={1}
        hideNavigation
        showOutsideDays={false}
        modifiers={{ has }}
        modifiersClassNames={{ has: "after:pointer-events-none after:absolute after:bottom-1.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary data-[selected=true]:after:bg-primary-foreground" }}
        className="w-full bg-transparent p-0 [--cell-size:--spacing(11)]"
        classNames={{ root: "w-full", month_caption: "hidden", today: "rounded-md ring-1 ring-border ring-inset" }}
      />
    </div>
  );
}

function Tile({ sel, now, onClick, title, sub }) {
  return (
    <Button
      variant={sel ? "default" : "outline"}
      aria-pressed={sel}
      onClick={onClick}
      className={cn("h-auto flex-col gap-1 rounded-xl py-3", now && !sel && "border-foreground")}
    >
      <b className="text-[15px] font-semibold">{title}</b>
      <small className={cn("amt text-[11px]", sel ? "text-primary-foreground/80" : "text-muted-foreground")}>{sub}</small>
    </Button>
  );
}

export function DatePickerSheet(sheet) {
  const { close } = useSheets();
  const L = ui.L; const now = new Date(); const nowM = today().slice(0, 7);
  const [st, setSt] = useState(() => {
    const s = { mode: L.period === "range" ? "range" : "specific", gran: L.period === "range" ? "day" : L.period,
      start: L.from || "", end: L.to || "",
      view: (L.period === "day" ? L.day : L.period === "month" ? L.month : L.period === "range" ? (L.to || L.from || today()) : today()).slice(0, 7),
      yearEnd: Math.max(now.getFullYear(), Number(L.year)) };
    if (s.start && s.end && s.end < s.start) [s.start, s.end] = [s.end, s.start];
    return s;
  });
  const set = (patch) => setSt((s) => ({ ...s, ...patch }));
  const [marks] = useState(() => spentBy(10)); const [spM] = useState(() => spentBy(7)); const [spY] = useState(() => spentBy(4));
  const D = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const PRESETS = [[t("This week"), ymd(mon), today()], [t("Last 7 days"), D(-6), today()], [t("Last 30 days"), D(-29), today()], [t("This month"), nowM + "-01", today()], [t("Last month"), ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ymd(new Date(now.getFullYear(), now.getMonth(), 0))], [t("Last 3 months"), ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)), today()], [t("This year"), `${now.getFullYear()}-01-01`, today()], [t("All time"), "", ""]];
  const finish = (period, patch) => { Object.assign(L, patch); L.period = period; saveL(); bump(); close(); };

  const switchMode = (mode) => {
    const patch = { mode };
    if (mode === "range" && !st.start && !st.end && L.period !== "range") {
      const [f, to] = periodRange(); const end = to > today() && f <= today() ? today() : to;
      Object.assign(patch, { start: f, end, view: end.slice(0, 7) });
    }
    set(patch);
  };
  const pickRangeDay = (d) => {
    if (!st.start || st.end) set({ start: d, end: "" });
    else if (d < st.start) set({ start: d, end: st.start });
    else set({ end: d });
  };

  let body, actions;
  if (st.mode === "specific") {
    body = <>
      <Segmented className="w-56 self-start" label={t("Pick a")} value={st.gran} onChange={(g) => set({ gran: g })} options={[["day", t("Day")], ["month", t("Month")], ["year", t("Year")]]} />
      {st.gran === "day" && (
        <MonthCalendar view={st.view} setView={(v) => set({ view: v })} marks={marks}
          mode="single" selected={L.period === "day" ? toDate(L.day) : undefined}
          onSelect={(_, d) => finish("day", { day: ymd(d) })} />
      )}
      {st.gran === "month" && (() => { const y = Number(st.view.slice(0, 4)); return <>
        <NavHead label={String(y)} onStep={(n) => set({ view: `${y + n}-${st.view.slice(5)}` })} />
        <div className="grid grid-cols-3 gap-2">{monthsShort().map((n, i) => { const k = `${y}-${pad(i + 1)}`; return <Tile key={k} sel={L.period === "month" && k === L.month} now={k === nowM} title={n} sub={spM[k] ? compact(spM[k]) : "—"} onClick={() => finish("month", { month: k })} />; })}</div>
      </>; })()}
      {st.gran === "year" && (() => { const ys = Array.from({ length: 12 }, (_, i) => st.yearEnd - 11 + i); return <>
        <NavHead label={`${ys[0]} – ${ys[11]}`} onStep={(n) => set({ yearEnd: st.yearEnd + 12 * n })} />
        <div className="grid grid-cols-3 gap-2">{ys.map((v) => <Tile key={v} sel={L.period === "year" && v === Number(L.year)} now={v === now.getFullYear()} title={v} sub={spY[v] ? compact(spY[v]) : "—"} onClick={() => finish("year", { year: v })} />)}</div>
      </>; })()}
    </>;
    actions = <>
      <Button variant="outline" onClick={() => (st.gran === "day" ? finish("day", { day: today() }) : st.gran === "month" ? finish("month", { month: nowM }) : finish("year", { year: now.getFullYear() }))}>{t({ day: "Today", month: "This month", year: "This year" }[st.gran])}</Button>
      <Button variant="outline" onClick={close}>{t("Cancel")}</Button>
    </>;
  } else {
    body = <>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 scrollbar-none">
        {PRESETS.map(([l, f, to]) => <Chip key={l} on={f === st.start && to === st.end} onPressedChange={() => set({ start: f, end: to, ...(to || f ? { view: (to || f).slice(0, 7) } : {}) })}>{l}</Chip>)}
      </div>
      <div className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("From")}</span><b className="font-semibold">{st.start ? fmtLong(st.start) : t("Any")}</b></div>
        <span aria-hidden="true">→</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("To")}</span><b className="font-semibold">{st.end ? fmtLong(st.end) : st.start ? t("Pick end") : t("Any")}</b></div>
      </div>
      <MonthCalendar view={st.view} setView={(v) => set({ view: v })} marks={marks}
        mode="range" selected={st.start ? { from: toDate(st.start), to: toDate(st.end || st.start) } : undefined}
        onSelect={(_, d) => pickRangeDay(ymd(d))} />
      <p className="text-xs text-muted-foreground">{t(!st.start ? "Tap a start date, or pick a preset." : !st.end ? "Now tap the end date. Tap the same day again for a single day." : "Tap any date to start over.")}</p>
    </>;
    actions = <>
      <Button variant="outline" onClick={close}>{t("Cancel")}</Button>
      <Button onClick={() => finish("range", { from: st.start, to: st.start && !st.end ? st.start : st.end })}>{t("Apply")}</Button>
    </>;
  }

  return (
    <AppSheet {...sheet} title={t("Dates")} headerExtra={<Segmented className="min-w-52" label={t("Date mode")} value={st.mode} onChange={switchMode} options={[["specific", t("Specific")], ["range", t("Range")]]} />}>
      {body}
      <SheetActions>{actions}</SheetActions>
    </AppSheet>
  );
}

export function FilterSheet(sheet) {
  const { close } = useSheets();
  const L = ui.L; const [from, to] = periodRange();
  const amounts = {}; Object.values(data().tx).forEach((x) => { if (x.date >= from && x.date <= to) amounts[x.category] = (amounts[x.category] || 0) + x.amount; });
  const setType = (v) => {
    L.type = v;
    if (v === "expense") L.cats = L.cats.filter((c) => EXP_CATS.includes(c));
    if (v === "income") L.cats = L.cats.filter((c) => INC_CATS.includes(c));
    saveL(); bump();
  };
  const toggle = (c, on) => { L.cats = on ? [...new Set([...L.cats, c])] : L.cats.filter((x) => x !== c); saveL(); bump(); };
  const group = (title, list) => (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</span>
      <div className="divide-y rounded-lg border bg-card">
        {list.map((c) => (
          <label key={c} className="flex cursor-pointer items-center gap-2.5 px-3 py-2">
            <Checkbox checked={L.cats.includes(c)} onCheckedChange={(v) => toggle(c, !!v)} />
            <CatBadge cat={c} size="sm" />
            <span className="flex-1">{t(c)}</span>
            <Amt className="text-[13px] text-muted-foreground">{amounts[c] ? money(amounts[c]) : ""}</Amt>
          </label>
        ))}
      </div>
    </div>
  );
  return (
    <AppSheet {...sheet} title={t("Filter")}>
      <Segmented label={t("Type")} value={L.type} onChange={setType} options={[["all", t("All")], ["expense", t("Expenses")], ["income", t("Income")]]} />
      {L.type !== "income" && group(t("Expense categories"), EXP_CATS)}
      {L.type !== "expense" && group(t("Income categories"), INC_CATS)}
      <SheetActions left={<Button variant="outline" onClick={clearFilter}>{t("Clear all")}</Button>}>
        <Button onClick={close}>{t("Show results")}</Button>
      </SheetActions>
    </AppSheet>
  );
}
