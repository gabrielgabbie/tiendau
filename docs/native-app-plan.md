# Plan: Tiền Đâu as a native app (iPhone and Android)

Written 31/10/2026. Nothing here is built yet.

## Goal
Publish Tiền Đâu on the App Store and Google Play. AI runs on the phone, so there's no cloud AI and nothing is billed to anyone, and records stay on the phone as they do now. The web app stays online for desktop and for anyone who doesn't install from a store.

## How the AI would work

| | iPhone | Android | Older or unsupported phones |
|---|---|---|---|
| **Model** | Apple Foundation Models (Apple Intelligence) | Gemini Nano through Google's ML Kit GenAI APIs | none |
| **Which phones** | iPhone 15 Pro and newer, iOS 26+, Apple Intelligence turned on | phones with Google's on-device AI service (recent Pixels, recent Galaxy flagships and similar) | everything else |
| **Bill photos** | iOS 27+: the model reads the photo directly; iOS 26: Apple's built-in text reader (Vision), then the model | the model reads the photo, or Google's on-phone text reader, then the model | built-in text reader, then our rules |
| **Chat messages** | rules first; the model only when the rules can't make sense of a message | same | rules only |
| **Siri / assistant** | "Hey Siri, ghi phở 55k trong Tiền Đâu" | an app shortcut for Google Assistant (later) | — |

Ground rules for all of them:
- **The rules stay the base.** They're instant, free and tested. The model helps only when the rules give up, or for photos.
- **Every amount the model returns must appear in the text** (the check in `src/lib/on-device-ai.js`).
- **Check language support first.** Confirm Apple Intelligence handles Vietnamese on the iOS version we target, and test both models on real Vietnamese bills before relying on them. If they don't, the app falls back to the rules.
- **The phones' built-in text readers replace Tesseract:** Apple Vision on iPhone and ML Kit text recognition on Android. They're faster, need no download and work offline. Their Vietnamese support also needs a check.

## What carries over and what's rebuilt
- **Copied as-is:**
  - `src/core/`: parser, categories, bill splitting, receipts, dates, money, i18n
  - the tests in `tests/`
- **Rebuilt:**
  - the screens, in React Native, using NativeWind with react-native-reusables (a port of shadcn for React Native) so the look stays close
  - the floating island menu and the bottom sheets, with React Native libraries
- **Storage:** `src/data/store.js` moves from `localStorage` to SQLite on the phone (expo-sqlite). The logic stays the same, including per-account storage, the backup reminder and backup export/import.
- **Moving from the web app:** people download a backup file in the web app and import it in the native app. There's no server copy to move.

## Stack
- **Expo with development builds.** The plain Expo Go app can't load our own native code.
- **Two small native modules** written with Expo's module system:
  - `tiendau-ai-ios` in Swift: Foundation Models (check availability, send a prompt, get JSON back, attach an image on iOS 27), plus Vision text reading
  - `tiendau-ai-android` in Kotlin: ML Kit GenAI and ML Kit text recognition
  - Both expose the same JavaScript functions, `readBill(image)` / `tidyText(text)`, so the screens don't care which phone they're on.
- **Siri:** App Intents in Swift (an `AppShortcutsProvider` with a "Log spending" intent). It writes into the same SQLite database and is added through an Expo config plugin.
- **Accounts:** Supabase stays. Sign-in changes to native Google sign-in passed to `signInWithIdToken`, which the web app already uses.

## App Store requirements
- **Sign in with Apple is required.** Apple's guideline 4.8 says an app that offers Google sign-in must also offer an equal privacy-focused option, and Sign in with Apple counts. It's free to add with the developer account (expo-apple-authentication).
- **In-app account deletion** is required. It already exists (`delete_my_account`).
- **Privacy labels:** "Data not collected", except the email used for sign-in. The privacy page already says this.
- **Costs:** Apple Developer Program $99 a year, Google Play $25 once.

## Phases
1. **Check the AI on real phones** (small, do first). Build a bare test app with the two native modules and run 20–30 real bills and typed messages on an iPhone 15 Pro or newer and on a supported Android phone. Compare against the current rules: does Vietnamese work, how accurate is it, how fast? Continue only if it clearly beats the rules.
2. **Core app.** Expo project, `src/core` copied in, SQLite store, Ghi / Sổ / Chia tiền screens, backup import/export. Guest mode only.
3. **AI on the phone.** Connect the modules to chat and bill photos, with the rules as fallback and a note in the chat showing which one read it.
4. **Accounts.** Native Google sign-in, Sign in with Apple, profile and settings.
5. **Siri** shortcuts on iPhone (Google Assistant shortcuts can come later).
6. **Store release.**
   - Testers first, through TestFlight and Play internal testing.
   - Then store listings with screenshots in VI and EN, and the privacy labels.
   - Then submission.

## Open decisions
- **Phase 1 first?** Recommended: prove the on-phone AI before building the rest.
- **One repo or two?** Recommended: the native app next to the web app in this repo, with `src/core` shared, so a parser fix lands in both.
- **Which phones to test on?** Phase 1 needs at least one iPhone 15 Pro or newer and, ideally, one supported Android phone.
