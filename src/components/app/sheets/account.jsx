// Account and settings in one sheet (profile picture, name, preferences, data), password change,
// and moving guest records into an account.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ChevronRight, Coins, Download, KeyRound, Languages, LogOut, MessageSquareX, Upload, User, Users, X } from "lucide-react";
import { CURRENCIES, today, t, LANGS } from "@/core/index.js";
import { S, put, sync, signOut, unsyncedCount, moveGuestDataToAccount, exportData, importData, deleteAllData, deleteAccount } from "@/data/store.js";
import { supabase } from "@/data/supabase.js";
import { settings, clearChat, bump, who, providerLabel, syncText, prefs, setLanguage, saveAvatar } from "@/lib/model.js";
import { friendly } from "@/lib/auth-errors.js";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppSheet, SheetActions, Field, Segmented, ConfirmButton, useSheets } from "@/components/app/bits.jsx";

export function SyncLine() {
  const dot = { syncing: "bg-primary", offline: "bg-warn", error: "bg-spend" }[sync.status] || "bg-earn";
  return (
    <p role="status" className={cn("flex items-center gap-2 text-[13px] text-muted-foreground", sync.status === "error" && "text-spend")}>
      <span className={cn("size-2 flex-none rounded-full", dot)} />{syncText()}
    </p>
  );
}

/** Your picture (or initials, or a person icon when signed out), used in the header and the account sheet. */
export function MeAvatar({ className, fallbackClass }) {
  const w = who();
  return (
    <Avatar className={className}>
      {w.avatar && <AvatarImage src={w.avatar} alt="" className="object-cover" />}
      <AvatarFallback className={cn("bg-accent font-bold text-accent-foreground", fallbackClass)}>
        {w.signedIn || w.name ? w.initial : <User className="size-[45%]" />}
      </AvatarFallback>
    </Avatar>
  );
}

/** One line in a settings group: icon, label, an optional value on the right, and a chevron when it opens something. */
function Row({ icon: Icon, label, value, onClick, danger, chevron = !!onClick, children }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick} className={cn("flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left text-[15px]", onClick && "active:bg-muted/60", danger && "text-spend")}>
      {Icon && <Icon className={cn("size-[18px] flex-none", danger ? "text-spend" : "text-muted-foreground")} />}
      <span className="min-w-0 flex-1 font-medium">{label}</span>
      {value != null && <span className="truncate text-sm text-muted-foreground">{value}</span>}
      {children}
      {chevron && <ChevronRight className="size-4 flex-none text-muted-foreground/70" />}
    </Comp>
  );
}
const Group = ({ title, children, note }) => (
  <section className="flex flex-col gap-1.5">
    {title && <h3 className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>}
    <div className="divide-y divide-border/60 overflow-hidden rounded-[8px] bg-card shadow-[0_1px_2px_rgb(0_0_0/0.05)]">{children}</div>
    {note && <p className="px-1 text-xs text-muted-foreground">{note}</p>}
  </section>
);

/** Account and settings in one place: profile with picture, then grouped settings. */
export function AccountSettingsSheet(sheet) {
  const { close } = useSheets();
  const s = settings(); const w = who();
  const email = (sync.user?.app_metadata?.provider || "email") === "email";
  const [sureOut, setSureOut] = useState(false);
  // pages inside this sheet: null (the main list), "people" or "password"; each has a back arrow
  const [page, setPage] = useState(null);
  const photo = useRef(null);
  const backup = useRef(null);
  const n = unsyncedCount();
  if (sync.mode !== "account") return null; // signed-in users only; signed out, the header button leads to sign-in

  const pickPhoto = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const avatar = await squarePhoto(f);
      saveAvatar(avatar);
      toast(t("Profile picture updated"));
    } catch { toast(t("That photo couldn't be read. Try another one.")); }
  };
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `tien-dau-backup-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast(t("Backup saved"));
  };
  const importBackup = (e) => {
    const f = e.target.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => { try { const c = importData(JSON.parse(r.result)); toast(t("Restored {tx} records and {bills} bills", { tx: c.tx, bills: c.bills })); } catch (err) { toast(err.message || t("That file couldn't be read.")); } };
    r.readAsText(f); e.target.value = "";
  };
  const out = async () => { if (n && !sureOut) { setSureOut(true); return; } await signOut(); close(); };

  if (page === "people") return (
    <AppSheet {...sheet} title={t("People")} onBack={() => setPage(null)}>
      <Group><div className="px-3.5 py-1.5"><PeopleList /></div></Group>
    </AppSheet>
  );
  if (page === "password") return (
    <AppSheet {...sheet} title={t("Change password")} onBack={() => setPage(null)}>
      <PasswordForm onDone={() => setPage(null)} />
    </AppSheet>
  );

  return (
    <AppSheet {...sheet} title={t("Account & settings")}
      headerExtra={<Button variant="ghost" size="icon-sm" className="size-9 rounded-full" aria-label={t("Close")} onClick={close}><X className="size-5" /></Button>}>
      {/* profile */}
      <div className="flex flex-col items-center gap-2 pb-1 text-center">
        <button type="button" className="relative rounded-full" onClick={() => photo.current.click()} aria-label={t(w.avatar ? "Change profile picture" : "Add profile picture")}>
          <MeAvatar className="size-24" fallbackClass="text-3xl" />
          <span className="absolute right-0 bottom-0 grid size-8 place-items-center rounded-full bg-foreground text-background ring-[3px] ring-background"><Camera className="size-4" /></span>
        </button>
        <input ref={photo} type="file" accept="image/*" hidden onChange={pickPhoto} />
        <NameField />
        <span className="text-[13px] [overflow-wrap:anywhere] text-muted-foreground">{w.email} · {t("Signed in with {provider}", { provider: providerLabel(sync.user.app_metadata?.provider) })}</span>
        <SyncLine />
        {w.avatar && s.avatar && <Button variant="link" size="sm" className="h-auto py-0 text-xs text-muted-foreground" onClick={() => saveAvatar(null)}>{t("Remove picture")}</Button>}
      </div>

      <Group title={t("Account")}>
          {email && <Row icon={KeyRound} label={t("Change password")} onClick={() => setPage("password")} />}
          <Row icon={LogOut} label={sureOut ? t("{n} changes haven't synced. Tap again to sign out anyway", { n }) : t("Sign out")} onClick={out} chevron={false} />
      </Group>

      <Group title={t("Preferences")}>
        <Row icon={Languages} label={t("Language")}>
          <Segmented size="sm" className="w-40" label={t("Language")} value={prefs.lang} onChange={setLanguage} options={Object.entries(LANGS)} />
        </Row>
        <Row icon={Coins} label={t("Currency")}>
          <Select value={s.currency} onValueChange={(v) => put("meta", Object.assign(settings(), { currency: v }))}>
            <SelectTrigger size="sm" className="w-24 bg-background" aria-label={t("Currency")}><SelectValue /></SelectTrigger>
            <SelectContent>{Object.keys(CURRENCIES).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Row>
        <Row icon={Users} label={t("People")} value={Object.keys(S.people).length || ""} onClick={() => setPage("people")} />
      </Group>

      <Group title={t("Data")} note={t("A backup saves all your records to a file. Restoring adds to what's here and updates records with the same id.")}>
        <Row icon={Download} label={t("Export backup")} onClick={exportBackup} chevron={false} />
        <Row icon={Upload} label={t("Import backup")} onClick={() => backup.current.click()} chevron={false} />
        <Row icon={MessageSquareX} label={t("Clear quick-add history")} onClick={() => { clearChat(); bump(); toast(t("History cleared")); }} chevron={false} />
        <input ref={backup} type="file" accept="application/json,.json" hidden onChange={importBackup} />
      </Group>

      <Group title={t("Danger zone")} note={t("Both are permanent. Export a backup first if you might want your records later.")}>
          <div className="flex flex-col items-start gap-2 p-3">
            <ConfirmButton label={t("Delete all my records")} confirmLabel={t("Tap again to delete every record")} onConfirm={async () => { await deleteAllData(); toast(t("All records deleted")); }} />
            <ConfirmButton label={t("Delete my account")} confirmLabel={t("Tap again to delete your account")} onConfirm={async () => { await deleteAccount(); close(); toast(t("Your account was deleted")); }} />
          </div>
      </Group>
      <SheetActions><Button onClick={close}>{t("Done")}</Button></SheetActions>
    </AppSheet>
  );
}

/** Your name, editable in place; saved to the account. */
function NameField() {
  const w = who();
  const [name, setName] = useState(w.name);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const v = name.trim();
    if (v === w.name) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: v } });
    setBusy(false);
    if (error) { toast(friendly(error)); setName(w.name); return; }
    toast(t("Name saved"));
  };
  return (
    <Input value={name} disabled={busy} placeholder={t("Your name")} aria-label={t("Your name")}
      className="h-9 max-w-64 border-transparent bg-transparent text-center text-lg font-semibold shadow-none hover:border-input focus-visible:bg-card"
      onChange={(e) => setName(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
}

/** A square, small copy of a photo for the profile picture (about 10–25 KB). */
async function squarePhoto(file, size = 256) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas"); c.width = c.height = size;
    c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return c.toDataURL("image/jpeg", 0.82);
  } finally { URL.revokeObjectURL(url); }
}

/** The people you split bills with; rename them here. */
function PeopleList() {
  const [renaming, setRenaming] = useState(null);
  const [newName, setNewName] = useState("");
  const people = Object.values(S.people).sort((a, b) => a.name.localeCompare(b.name));
  const rename = (p) => { const v = newName.trim(); if (v) put("people", Object.assign({}, p, { name: v })); setRenaming(null); };
  if (!people.length) return <p className="text-sm text-muted-foreground">{t("People appear here when you split a bill with them.")}</p>;
  return (
    <div className="flex flex-col">
      {people.map((p) => (
        <div key={p.id} className="flex min-h-11 items-center gap-2.5">
          {renaming === p.id ? <>
            <Input className="h-9 bg-background" value={newName} autoFocus aria-label={t("New name for {name}", { name: p.name })} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") rename(p); }} />
            <Button variant="link" size="sm" onClick={() => rename(p)}>{t("Save")}</Button>
          </> : <>
            <Avatar className="size-8"><AvatarFallback className="bg-muted text-xs font-semibold">{p.name[0]}</AvatarFallback></Avatar>
            <span className="flex-1 font-medium">{p.name}</span>
            <Button variant="link" size="sm" onClick={() => { setRenaming(p.id); setNewName(p.name); }}>{t("Rename")}</Button>
          </>}
        </div>
      ))}
    </div>
  );
}

/** New password: inline in the account sheet, and in its own sheet after a reset link. */
function PasswordForm({ onDone }) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setErr(t("Use at least 8 characters.")); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setErr(friendly(error)); return; }
    setPassword(""); setErr(""); toast(t("Password updated")); onDone?.();
  };
  return (
    <form className="flex flex-col gap-2.5" onSubmit={save} noValidate>
      <Field label={t("New password")} htmlFor="nPass"><Input id="nPass" className="h-10 bg-background" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></Field>
      {err && <p className="text-xs text-spend">{err}</p>}
      <Button type="submit" className="self-end" disabled={busy}>{t("Save password")}</Button>
    </form>
  );
}

/** Shown after someone opens a password-reset link. */
export function NewPasswordSheet(sheet) {
  const { close } = useSheets();
  return (
    <AppSheet {...sheet} title={t("Set a new password")}>
      <PasswordForm onDone={close} />
    </AppSheet>
  );
}

export function GuestDataSheet({ tx, bills, ...sheet }) {
  const { close } = useSheets();
  return (
    <AppSheet {...sheet} title={t("Bring your records with you?")}>
      <p>{t("This device has {tx} records and {bills} shared bills from before you signed in. Add them to your account so they sync everywhere?", { tx, bills })}</p>
      <SheetActions>
        <Button variant="outline" onClick={close}>{t("Not now")}</Button>
        <Button onClick={() => { const n = moveGuestDataToAccount(); close(); toast(t("Added {n} items to your account", { n })); }}>{t("Add to my account")}</Button>
      </SheetActions>
    </AppSheet>
  );
}
