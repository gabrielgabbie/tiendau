// "Continue with Google" through Google's own sign-in button (Google Identity Services).
// Google then shows this site's address instead of the Supabase project's, and Supabase checks
// the returned ID token. Needs VITE_GOOGLE_CLIENT_ID (the same Web client ID set in Supabase);
// without it the sign-in screen keeps the redirect button.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/data/supabase.js";
import { isVi } from "@/core/index.js";

export const googleClientId = (import.meta.env || {}).VITE_GOOGLE_CLIENT_ID || "";

let script = null;
const loadScript = () =>
  (script ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => { script = null; reject(new Error("Google's sign-in script didn't load")); };
    document.head.appendChild(s);
  }));

/** A random nonce, and its SHA-256 (Google gets the hash, Supabase the original). */
async function makeNonce() {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [raw, [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("")];
}

/** `run(fn)` is the sign-in screen's busy/error wrapper; `onError` shows a message when Google can't load. */
export function GoogleButton({ run, onError }) {
  const box = useRef(null);
  const [ready, setReady] = useState(false);
  const lang = isVi() ? "vi" : "en";

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const google = await loadScript();
        const [raw, hashed] = await makeNonce();
        if (gone || !box.current) return;
        google.accounts.id.initialize({
          client_id: googleClientId,
          nonce: hashed,
          use_fedcm_for_button: true,
          callback: ({ credential }) => run(async () => {
            const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: credential, nonce: raw });
            if (error) throw error;
          }),
        });
        box.current.replaceChildren();
        google.accounts.id.renderButton(box.current, {
          type: "standard", theme: "outline", size: "large", shape: "rectangular", text: "continue_with",
          logo_alignment: "center", locale: lang, width: Math.min(400, box.current.offsetWidth || 360),
        });
        setReady(true);
      } catch (e) {
        if (!gone) onError?.(e);
      }
    })();
    return () => { gone = true; };
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Google's button is 44px tall; keep the space so the page doesn't jump while it loads
  return <div ref={box} className="flex h-11 w-full justify-center" aria-busy={!ready} />;
}
