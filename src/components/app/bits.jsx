// Small building blocks shared by the screens and sheets.
import { createContext, useContext, useState } from "react";
import { toast } from "sonner";
import {
  UtensilsCrossed, Car, ShoppingBag, Receipt, House, HeartPulse, Ticket, Luggage, BookOpen, Gift, Tag,
  Banknote, Laptop, Star, TrendingUp, Undo2, CirclePlus, ArrowLeftRight, ArrowDown, ArrowUp, LayoutGrid, Scissors, CalendarDays, ChevronLeft,
} from "lucide-react";
import { t, fmtDate, ymd, isVi, LANGS } from "@/core/index.js";
import { vi, enGB } from "react-day-picker/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ICONS = {
  "Food & Drinks": UtensilsCrossed, Transport: Car, Shopping: ShoppingBag, Bills: Receipt, Housing: House,
  Health: HeartPulse, "Beauty & Care": Scissors, Entertainment: Ticket, Travel: Luggage, Education: BookOpen, Gifts: Gift, Other: Tag,
  Salary: Banknote, Freelance: Laptop, Bonus: Star, Gift, Investment: TrendingUp, Refund: Undo2, "Other income": CirclePlus,
  settle: ArrowLeftRight, expense: ArrowDown, income: ArrowUp, all: LayoutGrid,
};
// Colour slots by category. New categories go at the end so existing ones keep their colour.
const COLOR_ORDER = ["Food & Drinks", "Transport", "Shopping", "Bills", "Housing", "Health", "Entertainment", "Travel", "Education", "Gifts", "Other",
  "Salary", "Freelance", "Bonus", "Gift", "Investment", "Refund", "Other income"];
const OWN_COLOR = { "Beauty & Care": "var(--c9)" };
export const catColor = (c) => { if (OWN_COLOR[c]) return OWN_COLOR[c]; const i = COLOR_ORDER.indexOf(c); return `var(--c${(i < 0 ? 7 : i % 8) + 1})`; };
export function CatIcon({ cat, className, style }) { const I = ICONS[cat] || Tag; return <I className={className} style={style} strokeWidth={1.7} aria-hidden="true" />; }

/** Coloured square with a category icon. */
/** `soft`: a tinted square with a coloured icon instead of a solid one. */
export function CatBadge({ cat, color, size = "md", soft }) {
  const box = { sm: "size-7 rounded-lg [&_svg]:size-4", md: "size-[34px] rounded-[10px] [&_svg]:size-5" }[size];
  const c = color || catColor(cat);
  return (
    <span className={cn("grid flex-none place-items-center", !soft && "text-white", soft && "rounded-[8px]", box)}
      style={soft ? { background: `color-mix(in oklab, ${c} 16%, transparent)`, color: c } : { background: c }}>
      <CatIcon cat={cat} />
    </span>
  );
}

/** One-of-several picker, drawn with shadcn Tabs (no panels). */
export function Segmented({ value, onChange, options, size = "md", className, label }) {
  return (
    <Tabs value={value} onValueChange={onChange} className={className}>
      <TabsList aria-label={label} className={cn("w-full", size === "sm" ? "h-8!" : "h-10!")}>
        {options.map(([v, l]) => (
          <TabsTrigger key={v} value={v} className={cn("font-semibold", size === "sm" && "px-2.5 text-[13px]")}>{l}</TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** Language picker (a dropdown: there are three, two of them Vietnamese). */
export function LanguageSelect({ value, onChange, className }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className={cn("w-36 bg-background", className)} aria-label={t("Language")}><SelectValue /></SelectTrigger>
      <SelectContent>{Object.entries(LANGS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

/** Pill-shaped toggle; filled with ink when on. */
export function Chip({ on, className, ...props }) {
  return (
    <Toggle
      variant="outline"
      size="sm"
      pressed={!!on}
      className={cn("h-8 flex-none rounded-full bg-card px-3 text-[13px] font-normal data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background", className)}
      {...props}
    />
  );
}

export function Field({ label, htmlFor, children, hint, className }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Section({ title, children, first }) {
  return (
    <section className={cn("flex flex-col gap-2.5", !first && "border-t pt-3.5")}>
      {title && <h3 className="font-display text-[17px] leading-tight font-bold">{title}</h3>}
      {children}
    </section>
  );
}

export const Amt = ({ className, ...p }) => <span className={cn("amt", className)} {...p} />;

// ---------- sheets ----------
// One sheet open at a time; screens call open(Component, props).
export const SheetCtx = createContext({ open() {}, close() {} });
export const useSheets = () => useContext(SheetCtx);

/** Bottom sheet frame: a shadcn Sheet sized for a phone column. */
/** A bottom sheet. With onBack, a back arrow sits before the title (for pages inside the sheet). */
export function AppSheet({ open, onOpenChange, title, children, headerExtra, onBack }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[88dvh] w-full max-w-[560px] gap-3.5 overflow-y-auto rounded-t-[20px] border-0 pad-safe-x pt-2.5 pb-[calc(18px+env(safe-area-inset-bottom,0px))]"
      >
        <div className="h-1 w-10 flex-none self-center rounded-full bg-border" aria-hidden="true" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1">
            {onBack && <Button variant="ghost" size="icon-sm" className="-ml-1.5 size-9 rounded-full" aria-label={t("Back")} onClick={onBack}><ChevronLeft className="size-5" /></Button>}
            <SheetTitle className="font-display text-xl leading-tight font-bold">{title}</SheetTitle>
          </span>
          {headerExtra}
        </div>
        <SheetDescription className="sr-only">{title}</SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
  );
}

/** Cancel / Save row at the bottom of a sheet, with an optional destructive action on the left. */
export function SheetActions({ left, children }) {
  return <div className="mt-1 flex flex-wrap items-center justify-between gap-2.5">{left || <span />}<div className="flex flex-wrap gap-2">{children}</div></div>;
}

/** A button that asks for a second tap before doing something destructive. */
export function ConfirmButton({ label, confirmLabel, onConfirm, variant = "outline", className, ...props }) {
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      disabled={busy}
      className={cn("text-destructive hover:text-destructive", className)}
      onClick={async () => {
        if (!sure) { setSure(true); return; }
        setBusy(true);
        try { await onConfirm(); } catch (e) { setBusy(false); toast(e?.message || t("That didn't work. Try again.")); }
      }}
      {...props}
    >
      {sure ? confirmLabel : label}
    </Button>
  );
}

/** Hand-picked event colours (deep and light tone of one hue) for the folder look. */
const COVERS = [["#2F8F74", "#8ED9C2"], ["#D07A3A", "#F4C995"], ["#5B7FC7", "#AFC8F6"], ["#B8566F", "#F2AFC0"], ["#7A5FB0", "#C8B6EC"], ["#3E9AB0", "#9EDCEA"], ["#8C7A2E", "#E2D38E"]];

/** The two tones of an event's colour, picked from its id so it stays the same everywhere. */
export function eventTones(event) {
  const h = [...String(event.id || event.name || "")].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return COVERS[h % COVERS.length];
}


/** shadcn-style date picker: a button showing the date that opens a calendar. `value` is "YYYY-MM-DD". */
export function DateField({ id, value, onChange, className }) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value + "T00:00") : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* styled exactly like a select field, with a calendar icon where the chevron would be */}
        <button id={id} type="button" className={cn("flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:border-ring", !value && "text-muted-foreground", className)}>
          <span className="truncate">{value ? fmtDate(value, true) : t("Pick a date")}</span>
          <CalendarDays className="size-4 flex-none text-muted-foreground opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} defaultMonth={date} weekStartsOn={1} locale={isVi() ? vi : enGB}
          onSelect={(d) => { if (d) { onChange(ymd(d)); setOpen(false); } }} />
      </PopoverContent>
    </Popover>
  );
}
