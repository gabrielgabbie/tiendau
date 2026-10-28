// Sign-in screen: email and password first; Google, Apple or a one-time code below; or continue without an account.
import { useState } from "react";
import { ChevronLeft, Mail } from "lucide-react";
import { supabase, providers } from "@/data/supabase.js";
import { continueAsGuest } from "@/data/store.js";
import { friendly } from "@/lib/auth-errors.js";
import { t } from "@/core/index.js";
import { prefs, setLanguage } from "@/lib/model.js";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Field, LanguageSelect } from "@/components/app/bits.jsx";
import { GoogleButton, googleClientId } from "@/components/app/GoogleButton.jsx";

const redirectTo = () => location.origin + location.pathname;

export function BrandMark({ className = "size-13" }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="var(--primary)" />
      <path d="M15 11h18v26l-3-2-3 2-3-2-3 2-3-2-3 2Z" fill="none" stroke="var(--primary-foreground)" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M19.5 18h9M19.5 23h9M19.5 28h5" stroke="var(--primary-foreground)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

// brand marks for the sign-in buttons (single-colour, follow the text colour)
const GoogleMark = () => (
  <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8Z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8Z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4Z"/></svg>
);
const AppleMark = () => (
  <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true" fill="currentColor"><path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9a4.8 4.8 0 0 0-3.8-2c-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9a5 5 0 0 0-4.2 2.6c-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.6 1.3-.1 1.7-.8 3.3-.8 1.5 0 2 .8 3.3.8 1.4 0 2.2-1.3 3-2.5a10 10 0 0 0 1.4-2.8 4.4 4.4 0 0 1-2.3-4.2ZM13.9 5c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4Z"/></svg>
);

/** Privacy and terms (plain pages outside the app). */
export const LegalLinks = () => (
  <p className="mt-1 flex gap-4 text-xs text-muted-foreground">
    <a className="underline-offset-2 hover:underline" href="/privacy">{t("Privacy")}</a>
    <a className="underline-offset-2 hover:underline" href="/terms">{t("Terms")}</a>
  </p>
);

const LinkBtn = ({ className, ...p }) => <Button type="button" variant="link" className={cn("h-auto px-0 py-1 font-semibold", className)} {...p} />;

export function AuthScreen() {
  // view: "main" | "signup" | "code" | "codeSent" | "reset"
  const [view, setView] = useState("main");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const go = (v) => { setView(v); setErr(""); setMsg(""); };
  const run = async (fn) => {
    setBusy(true); setErr(""); setMsg("");
    try { await fn(); } catch (e) { setErr(friendly(e)); }
    setBusy(false);
  };
  const validEmail = () => { if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr(t("Enter a valid email address.")); return false; } return true; };
  const em = () => email.trim();

  const submitPassword = (e) => {
    e.preventDefault();
    if (!validEmail()) return;
    if (password.length < 8) { setErr(t("Use a password with at least 8 characters.")); return; }
    run(async () => {
      if (view === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: em(), password, options: { emailRedirectTo: redirectTo() } });
        if (error) throw error;
        if (!data.session) { setView("main"); setMsg(t("Almost there. We sent a confirmation link to {email}. Open it, then sign in here.", { email: em() })); }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: em(), password });
        if (error) throw error;
      }
    });
  };
  const submitCode = (e) => {
    e.preventDefault();
    if (!validEmail()) return;
    run(async () => {
      const { error } = await supabase.auth.signInWithOtp({ email: em(), options: { shouldCreateUser: true, emailRedirectTo: redirectTo() } });
      if (error) throw error;
      setView("codeSent");
    });
  };
  const submitVerify = (e) => {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length < 6) { setErr(t("Enter the code from the email.")); return; }
    run(async () => {
      const { error } = await supabase.auth.verifyOtp({ email: em(), token, type: "email" });
      if (error) throw error;
    });
  };
  const submitReset = (e) => {
    e.preventDefault();
    if (!validEmail()) return;
    run(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(em(), { redirectTo: redirectTo() });
      if (error) throw error;
      setView("main"); setMsg(t("If there's an account for {email}, a reset link is on its way.", { email: em() }));
    });
  };
  const oauth = (provider) => run(async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo() } });
    if (error) throw error; // on success the browser leaves for the provider's page
  });

  const emailField = <Field label={t("Email")} htmlFor="aEmail"><Input id="aEmail" className="h-11" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>;
  const wide = "h-11 w-full text-[15px]";
  const back = view !== "main" && view !== "signup";
  const social = providers.google || providers.apple;

  let form = null;
  if (view === "code") form = (
    <form className="flex flex-col gap-3" onSubmit={submitCode} noValidate>
      {emailField}
      <Button className={wide} disabled={busy}>{t("Email me a code")}</Button>
      <p className="text-xs text-muted-foreground">{t("We'll send a 6-digit code. No password needed.")}</p>
    </form>
  );
  else if (view === "codeSent") form = (
    <form className="flex flex-col gap-3" onSubmit={submitVerify} noValidate>
      <p>{t("Enter the code we sent to")} <b>{em()}</b>.</p>
      <Field label={t("6-digit code")} htmlFor="aCode"><Input id="aCode" className="amt h-12 text-center text-[22px] tracking-[.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} autoFocus /></Field>
      <Button className={wide} disabled={busy}>{t("Sign in")}</Button>
      <LinkBtn className="self-start" onClick={() => go("code")}>{t("Send a new code")}</LinkBtn>
    </form>
  );
  else if (view === "reset") form = (
    <form className="flex flex-col gap-3" onSubmit={submitReset} noValidate>
      {emailField}
      <Button className={wide} disabled={busy}>{t("Email me a reset link")}</Button>
    </form>
  );
  else form = (
    <form className="flex flex-col gap-3" onSubmit={submitPassword} noValidate>
      {emailField}
      <Field label={t("Password")} htmlFor="aPass"><Input id="aPass" className="h-11" type="password" autoComplete={view === "signup" ? "new-password" : "current-password"} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <Button className={wide} disabled={busy}>{t(view === "signup" ? "Create account" : "Sign in")}</Button>
      <div className="flex flex-wrap justify-between gap-1.5">
        {view === "signup"
          ? <LinkBtn onClick={() => go("main")}>{t("I already have an account")}</LinkBtn>
          : <><LinkBtn onClick={() => go("signup")}>{t("Create an account")}</LinkBtn><LinkBtn onClick={() => go("reset")}>{t("Forgot password?")}</LinkBtn></>}
      </div>
    </form>
  );

  return (
    <div className="flex h-full justify-center overflow-y-auto pad-safe-x pt-[calc(28px+env(safe-area-inset-top,0px))] pb-[calc(24px+env(safe-area-inset-bottom,0px))]">
      <div className="flex w-full max-w-[400px] flex-col gap-3.5">
        <div className="mb-2 flex flex-col gap-1.5">
          <LinkBtn className="-mt-2 mb-1 self-start" onClick={continueAsGuest}><ChevronLeft className="size-4" />{t("Back")}</LinkBtn>
          <div className="flex items-start justify-between gap-3">
            <BrandMark />
            <LanguageSelect value={prefs.lang} onChange={setLanguage} />
          </div>
          <h1 className="mt-1.5 font-display text-[30px] leading-[1.05] font-bold tracking-tight">Tiền Đâu</h1>
          <p className="text-base text-balance text-muted-foreground">{t("Log spending in seconds. Split bills without the math.")}</p>
        </div>
        {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
        {msg && <Alert className="border-0 bg-accent"><AlertDescription className="text-foreground">{msg}</AlertDescription></Alert>}
        {back && <LinkBtn className="self-start" onClick={() => go("main")}>‹ {t("Back")}</LinkBtn>}
        {providers.email && form}
        {/* other ways to sign in, below the email form */}
        {!back && (social || providers.email) && (
          <div className="mt-2 flex flex-col gap-2.5">
            <div className="flex items-center gap-2.5 text-xs tracking-wider text-muted-foreground uppercase"><Separator className="flex-1" />{t("Other ways")}<Separator className="flex-1" /></div>
            {providers.google && (googleClientId
              ? <GoogleButton run={run} onError={() => setErr(t("Can't reach the server. Check your connection and try again."))} />
              : <Button variant="outline" className={wide} disabled={busy} onClick={() => oauth("google")}><GoogleMark />{t("Continue with Google")}</Button>)}
            {providers.apple && <Button variant="outline" className={wide} disabled={busy} onClick={() => oauth("apple")}><AppleMark />{t("Continue with Apple")}</Button>}
            {providers.email && <Button variant="outline" className={wide} disabled={busy} onClick={() => go("code")}><Mail />{t("Email me a one-time code")}</Button>}
          </div>
        )}
        <div className="mt-2.5 flex flex-col items-start gap-1 border-t pt-3.5">
          <LinkBtn onClick={continueAsGuest}>{t("Continue without an account")}</LinkBtn>
          <p className="text-xs text-muted-foreground">{t("Records stay on this device. You can sign in later and bring them with you.")}</p>
        </div>
        <LegalLinks />
      </div>
    </div>
  );
}
