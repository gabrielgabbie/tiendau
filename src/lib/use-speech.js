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
