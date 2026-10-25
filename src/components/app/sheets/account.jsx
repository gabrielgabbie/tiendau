// Settings, the signed-in account, password change, and moving guest records into an account.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CURRENCIES, today, t, LANGS } from "@/core/index.js";
import { S, put, sync, signOut, unsyncedCount, moveGuestDataToAccount, exportData, importData, deleteAllData, deleteAccount } from "@/data/store.js";
import { supabase } from "@/data/supabase.js";
import { settings, clearChat, bump, who, providerLabel, syncText, prefs, setLanguage, setTheme } from "@/lib/model.js";
import { friendly } from "@/lib/auth-errors.js";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppSheet, SheetActions, Field, Section, Segmented, ConfirmButton, useSheets } from "@/components/app/bits.jsx";
import { Moon, Sun } from "lucide-react";

export function SyncLine() {
  const dot = { syncing: "bg-primary", offline: "bg-warn", error: "bg-spend" }[sync.status] || "bg-earn";
  return (
    <p role="status" className={cn("flex items-center gap-2 text-[13px] text-muted-foreground", sync.status === "error" && "text-spend")}>
      <span className={cn("size-2 flex-none rounded-full", dot)} />{syncText()}
    </p>
  );
}

export function Identity({ big = true, signedOut }) {
  const w = signedOut ? null : who();
  const prov = signedOut ? "" : providerLabel(sync.user.app_metadata?.provider);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className={big ? "size-11" : "size-9"}>
        <AvatarFallback className="bg-accent text-lg font-bold text-accent-foreground">{w ? w.initial : "?"}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <b className="truncate font-semibold">{w ? w.name || w.email : t("Not signed in")}</b>
        <span className="text-[13px] [overflow-wrap:anywhere] text-muted-foreground">
          {w ? <>{w.name ? w.email : ""}{big ? `${w.name ? " · " : ""}${t("Signed in with {provider}", { provider: prov })}` : ""}</> : t("Records are saved on this device only.")}
        </span>
      </div>
    </div>
  );
}

function SignOutButton({ after }) {
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const n = unsyncedCount();
  return (
    <Button variant="outline" className="self-start" disabled={busy} onClick={async () => {
      if (n && !sure) { setSure(true); return; }
      setBusy(true); await signOut(); after?.();
    }}>
      {sure ? t("{n} changes haven't synced. Tap again to sign out anyway", { n }) : t("Sign out")}
    </Button>
  );
}

export function AccountSheet(sheet) {
  const { open, close } = useSheets();
  if (sync.mode !== "account") return null;
  const email = (sync.user.app_metadata?.provider || "email") === "email";
  return (
    <AppSheet {...sheet} title={t("Your account")}>
      <Section first>
        <Identity />
        <SyncLine />
        <SignOutButton after={close} />
      </Section>
      {email && <Section title={t("Password")}><Button variant="outline" className="self-start" onClick={() => open(NewPasswordSheet, {})}>{t("Change password")}</Button></Section>}
      <Section title={t("Danger zone")}>
        <ConfirmButton className="self-start" label={t("Delete my account")} confirmLabel={t("Tap again to delete your account")} onConfirm={async () => { await deleteAccount(); close(); toast(t("Your account was deleted")); }} />
        <p className="text-xs text-muted-foreground">{t("This permanently deletes your account and every record in it. Export a backup from Settings first if you might want your records later.")}</p>
      </Section>
      <SheetActions><Button onClick={close}>{t("Done")}</Button></SheetActions>
    </AppSheet>
  );
}

export function SettingsSheet(sheet) {
  const { close } = useSheets();
  const s = settings(); const acct = sync.mode === "account";
  const [renaming, setRenaming] = useState(null);
  const [newName, setNewName] = useState("");
  const file = useRef(null);
  const people = Object.values(S.people).sort((a, b) => a.name.localeCompare(b.name));

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

  return (
    <AppSheet {...sheet} title={t("Settings")}>
      <Section title={t("Preferences")} first>
        <Field label={t("Language")}>
          <Segmented label={t("Language")} value={prefs.lang} onChange={setLanguage} options={Object.entries(LANGS)} />
        </Field>
        <Field label={t("Theme")}>
          <Segmented label={t("Theme")} value={prefs.theme} onChange={setTheme} options={[["light", <><Sun />{t("Light")}</>], ["dark", <><Moon />{t("Dark")}</>]]} />
        </Field>
        <Field label={t("Currency")} htmlFor="sCur" hint={t("Changing currency only changes how amounts are shown. It doesn't convert existing records.")}>
          <Select value={s.currency} onValueChange={(v) => put("meta", Object.assign(settings(), { currency: v }))}>
            <SelectTrigger id="sCur" className="h-10 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.keys(CURRENCIES).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={t("People")}>
          <div className="divide-y rounded-lg border bg-card">
            {people.length ? people.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 px-3 py-1.5">
                {renaming === p.id ? <>
                  <Input className="h-8 bg-background" value={newName} autoFocus aria-label={t("New name for {name}", { name: p.name })} onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.nextSibling.click(); }} />
                  <Button variant="link" size="sm" onClick={() => { const n = newName.trim(); if (n) put("people", Object.assign({}, p, { name: n })); setRenaming(null); }}>{t("Save")}</Button>
                </> : <>
                  <span className="flex-1 font-medium">{p.name}</span>
                  <Button variant="link" size="sm" onClick={() => { setRenaming(p.id); setNewName(p.name); }}>{t("Rename")}</Button>
                </>}
              </div>
            )) : <div className="px-3 py-2 text-muted-foreground">{t("People appear here when you split a bill with them.")}</div>}
          </div>
        </Field>
        <Button variant="outline" className="self-start" onClick={() => { clearChat(); bump(); toast(t("History cleared")); }}>{t("Clear quick-add history")}</Button>
      </Section>
      <Section title={t("Backup")}>
        <p className="text-xs text-muted-foreground">{t("Save all your records to a file, or restore them from one. Restoring adds to what's here and updates records with the same id.")}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportBackup}>{t("Export backup")}</Button>
          <Button variant="outline" onClick={() => file.current.click()}>{t("Import backup")}</Button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={importBackup} />
        </div>
      </Section>
      {acct && (
        <Section title={t("Danger zone")}>
          <ConfirmButton className="self-start" label={t("Delete all my records")} confirmLabel={t("Tap again to delete every record")} onConfirm={async () => { await deleteAllData(); toast(t("All records deleted")); }} />
          <p className="text-xs text-muted-foreground">{t("This is permanent. Export a backup first if you might want your records later. To delete your account, open the account menu.")}</p>
        </Section>
      )}
      <SheetActions><Button onClick={close}>{t("Done")}</Button></SheetActions>
    </AppSheet>
  );
}

/** Shown after someone opens a password-reset link, or from the account sheet. */
export function NewPasswordSheet(sheet) {
  const { close } = useSheets();
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
    close(); toast(t("Password updated"));
  };
  return (
    <AppSheet {...sheet} title={t("Set a new password")}>
      <form className="flex flex-col gap-3" onSubmit={save} noValidate>
        <Field label={t("New password")} htmlFor="nPass"><Input id="nPass" className="h-10" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></Field>
        {err && <p className="text-xs text-spend">{err}</p>}
        <SheetActions>
          <Button type="button" variant="outline" onClick={close}>{t("Cancel")}</Button>
          <Button type="submit" disabled={busy}>{t("Save password")}</Button>
        </SheetActions>
      </form>
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
