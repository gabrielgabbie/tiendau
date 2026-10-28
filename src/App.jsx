// App shell: sign-in or the one-screen app (header, current screen, bottom tabs), plus the open sheet.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { HandCoins, Plus, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { setCurrency, t } from "@/core/index.js";
import { sync, on, LS, showSignIn } from "@/data/store.js";
import { ui, data, settings, subscribe, getVersion, bump, chatLog, prefs } from "@/lib/model.js";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { SheetCtx } from "@/components/app/bits.jsx";
import { AuthScreen } from "@/components/app/AuthScreen.jsx";
import { ChatView, Composer, LedgerView, SplitView } from "@/components/app/views.jsx";
import { AccountSettingsSheet, NewPasswordSheet, GuestDataSheet, MeAvatar } from "@/components/app/sheets/account.jsx";

// bottom bar order: Ledger · Log (the main action) · Split
const TABS = [
  ["ledger", "Ledger", ReceiptText, "Spending & income"],
  ["chat", "Log", Plus, "Log by chat"],
  ["split", "Split", HandCoins, "Shared bills"],
];

// toasts sit at the top: the bottom holds the floating chat box, tab buttons and sheet actions, which they would cover
const TOAST_OFFSET = { top: "calc(12px + env(safe-area-inset-top, 0px))" };

/** The one header button: your picture (or initials), opening account & settings. A dot shows sync trouble. */
function MeButton({ open }) {
  const acct = sync.mode === "account";
  const dot = acct && { syncing: "bg-primary", offline: "bg-warn", error: "bg-spend" }[sync.status];
  const hint = !acct ? "" : sync.status === "offline" ? t("Offline, changes waiting") : sync.status === "error" ? t("A change couldn't be saved") : "";
  return (
    // signed out, there's nothing to set: the button just leads to signing in
    <button type="button" title={hint} onClick={() => acct ? open(AccountSettingsSheet, {}) : sync.configured ? showSignIn() : toast(t("Accounts aren't set up for this copy of the app yet."))}
      aria-label={acct ? t("Account & settings") : t("Sign in or create an account")}
      className="relative rounded-full shadow-[0_6px_16px_-10px_rgb(0_0_0/0.3)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none">
      <MeAvatar className="size-[38px] ring-2 ring-card" fallbackClass="text-[15px]" />
      {dot && <span className={cn("absolute top-0 right-0 size-[10px] rounded-full border-2 border-background", dot)} />}
    </button>
  );
}

export default function App() {
  useSyncExternalStore(subscribe, getVersion);
  const [sheet, setSheet] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const open = useCallback((C, props) => { setSheet({ C, props, key: Date.now() }); setSheetOpen(true); }, []);
  const close = useCallback(() => setSheetOpen(false), []);
  const sheets = useMemo(() => ({ open, close }), [open, close]);

  const [draft, setDraft] = useState(() => LS.get("pl-draft", ""));
  const [composerH, setComposerH] = useState(0); // height of the floating chat box
  const inputRef = useRef(null);
  const mainRef = useRef(null);

  useEffect(() => {
    const offs = [
      on("guestData", (counts) => open(GuestDataSheet, counts)),
      on("recovery", () => open(NewPasswordSheet, {})),
      on("mode", () => { if (sync.mode === "none" || sync.mode === "guest") setSheetOpen(false); }),
    ];
    return () => offs.forEach((f) => f());
  }, [open]);

  // chat sticks to the newest message
  useLayoutEffect(() => { if (ui.tab === "chat" && chatLog.length && mainRef.current) mainRef.current.scrollTop = mainRef.current.scrollHeight; });

  if (sync.mode === "loading") return null; // a moment while the saved session is checked
  if (sync.mode === "none") return <><AuthScreen /><Toaster theme={prefs.theme} position="top-center" /></>;

  setCurrency(settings().currency);
  const D = data();
  // each screen opens at its top (Log then jumps to its newest message)
  const setTab = (tab) => { if (tab !== ui.tab && mainRef.current) mainRef.current.scrollTop = 0; ui.tab = tab; bump(); };
  // the centre button always means "log something": open Log and put the cursor in the box
  const logNow = () => { if (ui.tab !== "chat") setTab("chat"); requestAnimationFrame(() => inputRef.current?.focus()); };
  const say = (s) => { setDraft(s); LS.set("pl-draft", s); inputRef.current?.focus(); };

  return (
    <SheetCtx.Provider value={sheets}>
      <Tabs value={ui.tab} onValueChange={setTab} className="relative mx-auto flex h-full max-w-[560px] flex-col gap-0">
        <header className="flex items-center gap-2.5 pad-safe-x pt-[calc(12px+env(safe-area-inset-top,0px))] pb-2">
          <h1 className="flex-1 font-display text-[22px] leading-none font-bold tracking-tight">
            Tiền Đâu
            <small className="mt-1 block font-sans text-[11px] leading-snug font-medium tracking-[.08em] text-muted-foreground uppercase">{t(TABS.find((x) => x[0] === ui.tab)?.[3])}</small>
          </h1>
          <MeButton open={open} />
        </header>
        <main ref={mainRef} className="flex flex-1 flex-col overflow-y-auto overscroll-contain pad-safe-x pt-1"
          style={{ paddingBottom: `calc(${ui.tab === "chat" ? composerH + 84 : 84}px + env(safe-area-inset-bottom, 0px))` }}>
          <TabsContent value="chat" className="flex flex-col"><ChatView say={say} /></TabsContent>
          <TabsContent value="ledger"><LedgerView D={D} /></TabsContent>
          <TabsContent value="split"><SplitView D={D} /></TabsContent>
        </main>
        {ui.tab === "chat" && <Composer inputRef={inputRef} text={draft} setText={setDraft} onHeight={setComposerH} />}
        {/* "dynamic island": round buttons floating over the page (no bar behind them); the active one turns dark and widens to show its name */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))]">
          <TabsList className="pointer-events-auto h-auto! gap-2 bg-transparent p-0">
            {TABS.map(([v, l, I]) => (
              <TabsTrigger key={v} value={v} onClick={v === "chat" ? logNow : undefined} aria-label={t(l)}
                className="group/tab h-12 min-w-12 flex-none gap-0 rounded-full border-0 bg-card/90 px-3.5 shadow-[0_8px_24px_-8px_rgb(0_0_0/0.35)]! ring-1 ring-foreground/[0.06] backdrop-blur-xl focus-visible:border-0 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none text-[15px] font-semibold text-foreground transition-[background-color,color,padding] duration-300 ease-out hover:text-foreground motion-reduce:transition-none data-[state=active]:bg-foreground data-[state=active]:px-5 data-[state=active]:text-background dark:bg-background/50 dark:text-foreground dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-foreground dark:data-[state=active]:text-background [&_svg]:size-5!">
                <I strokeWidth={v === "chat" ? 2.6 : 1.7} />
                <span aria-hidden="true" className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,margin] duration-300 ease-out motion-reduce:transition-none group-data-[state=active]/tab:ml-2 group-data-[state=active]/tab:max-w-32 group-data-[state=active]/tab:opacity-100">{t(l)}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      {sheet && <sheet.C key={sheet.key} {...sheet.props} open={sheetOpen} onOpenChange={(o) => !o && close()} />}
      <Toaster theme={prefs.theme} position="top-center" offset={TOAST_OFFSET} mobileOffset={TOAST_OFFSET} />
    </SheetCtx.Provider>
  );
}
