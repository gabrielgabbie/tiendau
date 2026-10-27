// Asking for the microphone the way apps do: explain first, then the browser's own dialog.
// If it was blocked before, browsers won't ask again, so show how to turn it back on.
import { useState } from "react";
import { Mic, MicOff, Lock, Keyboard } from "lucide-react";
import { t } from "@/core/index.js";
import { askForMic, micDevice } from "@/lib/use-speech.js";
import { Button } from "@/components/ui/button";
import { AppSheet, SheetActions, useSheets } from "@/components/app/bits.jsx";

const STEPS = {
  "ios-safari": [
    "Tap the “aA” button in Safari's address bar.",
    "Tap “Website Settings”.",
    "Set Microphone to “Allow”.",
  ],
  "ios-app": [
    "Open the Settings app on your iPhone.",
    "Go to Apps → Safari → Microphone.",
    "Choose “Allow”, then come back to Tiền Đâu.",
  ],
  android: [
    "Tap the icon left of the address in Chrome.",
    "Tap “Permissions”, then “Microphone”.",
    "Choose “Allow”.",
  ],
  desktop: [
    "Click the icon left of the address bar.",
    "Find “Microphone” and switch it to “Allow”.",
    "Reload the page if your browser asks.",
  ],
};

/** state: "prompt" (not asked yet), "denied" (blocked), "insecure" (http page) or "unsupported" (no voice
 *  recognition in this browser). onReady starts listening; onKeyboard focuses the box for keyboard dictation. */
export function MicSheet({ state: initial, onReady, onKeyboard, ...sheet }) {
  const { close } = useSheets();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    setBusy(true);
    const ok = await askForMic();
    setBusy(false);
    if (ok) { close(); onReady(); } else setState("denied");
  };

  const keyboard = () => { close(); onKeyboard?.(); };
  const ios = micDevice().startsWith("ios");
  const keyboardTip = ios && <Notice icon={Keyboard}>{t("You can still speak: tap the box, then the mic on your iPhone keyboard.")}</Notice>;
  const keyboardButton = ios && <Button onClick={keyboard}><Keyboard />{t("Use keyboard mic")}</Button>;

  if (state === "unsupported") {
    const why = { "ios-app": "Voice input isn't available in the home-screen app. Open Tiền Đâu in Safari to use it.", "ios-safari": "Voice input isn't available in this browser. On iPhone it works in Safari." }[micDevice()]
      || "Voice input isn't available in this browser. Try Chrome or Safari.";
    return (
      <AppSheet {...sheet} title={t("Voice input isn't available here")}>
        <Notice icon={MicOff}>{t(why)}</Notice>
        {keyboardTip}
        <SheetActions>
          {ios ? <><Button variant="outline" onClick={close}>{t("Not now")}</Button>{keyboardButton}</> : <Button onClick={close}>{t("OK")}</Button>}
        </SheetActions>
      </AppSheet>
    );
  }
  if (state === "insecure") {
    return (
      <AppSheet {...sheet} title={t("Voice input needs a secure link")}>
        <Notice icon={Lock}>{t("Browsers only allow the microphone on https pages. Open Tiền Đâu from its https address (for example the Vercel link) to speak.")}</Notice>
        {keyboardTip}
        <SheetActions>
          {ios ? <><Button variant="outline" onClick={close}>{t("Not now")}</Button>{keyboardButton}</> : <Button onClick={close}>{t("OK")}</Button>}
        </SheetActions>
      </AppSheet>
    );
  }
  if (state === "denied") {
    return (
      <AppSheet {...sheet} title={t("Microphone is blocked")}>
        <Notice icon={MicOff}>{t("Your browser won't ask again, so turn it on in settings:")}</Notice>
        <ol className="flex flex-col gap-2.5">
          {STEPS[micDevice()].map((s, i) => (
            <li key={i} className="flex items-start gap-3 text-[15px]">
              <span className="grid size-6 flex-none place-items-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
              <span className="pt-0.5">{t(s)}</span>
            </li>
          ))}
        </ol>
        <SheetActions>
          <Button variant="outline" onClick={close}>{t("Not now")}</Button>
          <Button disabled={busy} onClick={ask}>{t("Try again")}</Button>
        </SheetActions>
      </AppSheet>
    );
  }
  return (
    <AppSheet {...sheet} title={t("Log by voice")}>
      <Notice icon={Mic}>{t("Tiền Đâu needs your microphone to hear what you spent, like “phở 55 nghìn”. It only listens while the mic button is on.")}</Notice>
      <SheetActions>
        <Button variant="outline" onClick={close}>{t("Not now")}</Button>
        <Button disabled={busy} onClick={ask}><Mic />{t("Allow microphone")}</Button>
      </SheetActions>
    </AppSheet>
  );
}

function Notice({ icon: Icon, children }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-10 flex-none place-items-center rounded-full bg-primary/10 text-primary"><Icon className="size-5" /></span>
      <p className="pt-1 text-[15px] leading-snug text-muted-foreground">{children}</p>
    </div>
  );
}
