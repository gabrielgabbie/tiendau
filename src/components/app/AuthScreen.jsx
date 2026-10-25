// Sign-in screen: Google, Apple, email (password or one-time code), or continue without an account.
import { useState } from "react";
import { supabase, providers } from "@/data/supabase.js";
import { continueAsGuest } from "@/data/store.js";
import { friendly } from "@/lib/auth-errors.js";
import { t, LANGS } from "@/core/index.js";
import { prefs, setLanguage } from "@/lib/model.js";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Field, Segmented } from "@/components/app/bits.jsx";

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
          <div className="flex items-start justify-between gap-3">
            <BrandMark />
            <Segmented size="sm" className="w-44" label={t("Language")} value={prefs.lang} onChange={setLanguage} options={Object.entries(LANGS)} />
          </div>
          <h1 className="mt-1.5 font-display text-[30px] leading-[1.05] font-bold tracking-tight">Tiền Đâu</h1>
          <p className="text-base text-balance text-muted-foreground">{t("Log spending in seconds. Split bills without the math.")}</p>
        </div>
        {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
        {msg && <Alert className="border-0 bg-accent"><AlertDescription className="text-foreground">{msg}</AlertDescription></Alert>}
        {!back && social && <>
          <div className="flex flex-col gap-2.5">
            {providers.google && <Button variant="outline" className={wide} disabled={busy} onClick={() => oauth("google")}>{t("Continue with Google")}</Button>}
            {providers.apple && <Button variant="outline" className={wide} disabled={busy} onClick={() => oauth("apple")}>{t("Continue with Apple")}</Button>}
          </div>
          {providers.email && <div className="flex items-center gap-2.5 text-xs tracking-wider text-muted-foreground uppercase"><Separator className="flex-1" />{t("or use email")}<Separator className="flex-1" /></div>}
        </>}
        {back && <LinkBtn className="self-start" onClick={() => go("main")}>‹ {t("Back")}</LinkBtn>}
        {providers.email && form}
        {providers.email && (view === "main" || view === "signup") && <LinkBtn className="self-start" onClick={() => go("code")}>{t("Sign in with a one-time code instead")}</LinkBtn>}
        <div className="mt-2.5 flex flex-col items-start gap-1 border-t pt-3.5">
          <LinkBtn onClick={continueAsGuest}>{t("Continue without an account")}</LinkBtn>
          <p className="text-xs text-muted-foreground">{t("Records stay on this device. You can sign in later and bring them with you.")}</p>
        </div>
      </div>
    </div>
  );
}
