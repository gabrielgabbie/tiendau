// Voice input through the browser's built-in speech recognition (Chrome, Edge, Safari).
// Text arrives while you speak; it stops by itself after a pause, or when stop() is called.
import { useEffect, useRef, useState } from "react";

const Recognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const speechSupported = !!Recognition;

/** onText(transcript) is called with the full text heard so far; onError(code) with codes like "not-allowed". */
export function useSpeech({ lang, onText, onError }) {
  const [listening, setListening] = useState(false);
  const rec = useRef(null);
  const handlers = useRef({ onText, onError });
  handlers.current = { onText, onError };

  useEffect(() => () => rec.current?.abort(), []);

  const start = () => {
    if (!Recognition || rec.current) return;
    const r = new Recognition();
    r.lang = lang;
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      let text = "";
      for (const res of e.results) text += res[0].transcript;
      handlers.current.onText(text.trim());
    };
    r.onerror = (e) => { if (e.error !== "aborted") handlers.current.onError?.(e.error); };
    r.onend = () => { rec.current = null; setListening(false); };
    rec.current = r;
    try { r.start(); setListening(true); } catch { rec.current = null; }
  };
  const stop = () => rec.current?.stop();

  return { listening, start, stop, supported: speechSupported };
}

/** "granted" | "denied" | "prompt" | "insecure". "insecure": http pages never get the microphone. */
export async function micPermission() {
  if (typeof window !== "undefined" && !window.isSecureContext) return "insecure";
  try {
    const s = await navigator.permissions.query({ name: "microphone" });
    return s.state;
  } catch {
    return "prompt"; // Safari before 16 can't tell; asking is how we find out
  }
}

/** Shows the browser's own "allow microphone?" dialog. Resolves true when allowed. */
export async function askForMic() {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((tr) => tr.stop()); // only needed the permission
    return true;
  } catch {
    return false;
  }
}

/** Which set of "turn it back on" steps fits this device. */
export function micDevice() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone;
  if (ios) return standalone ? "ios-app" : "ios-safari";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}
