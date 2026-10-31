# Tiền Đâu

Log spending and income in seconds, and split bills with friends. An installable web app (PWA) for iPhone and Android. Records stay on the phone, signed in or not; accounts through [Supabase](https://supabase.com) only say who you are.

- **Quick add**: type `phở 55k, grab 32k` or `dinner 1.2tr với An, Bình #Dalat ship 30k`. Rules on the device read it; no AI and nothing sent anywhere except your own database.
- **Ledger**: filter by day, month, year or a date range, by type and category, and sort by date or amount.
- **Split**: shared bills with per-person items, fees and discounts that each split their own way, several payers, events, and settle-up suggestions.
- **Accounts**: sign in with Google, Apple, or email (password or a one-time code). The account holds only the sign-in details; records never leave the phone.
- **Guest mode**: use it without an account; sign in later and bring your records with you.
- **Backup**: export everything to a file and restore it, also how you move to a new phone. A reminder shows after 30 days without one.

---

## Setup (about 20 minutes)

You need a free Supabase account, a free hosting account (Vercel or Netlify), and Node.js 18+ on your computer.

### 1. Create the database

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick a region close to you (Singapore for Vietnam) and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste everything from `supabase/migrations/0001_init.sql`, and press **Run**.
   This adds the "delete my account" function. (It also creates record tables that older versions synced to; the app now only reads them once, to move any records left there onto the phone, and then empties them.)
3. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key.

### 2. Run it on your computer

```bash
npm install
cp .env.example .env     # then paste the URL and anon key into .env
npm run dev              # opens http://localhost:5173
```

Email sign-in works straight away. Google and Apple need the steps below.

### 3. Email sign-in

In Supabase → **Authentication → Sign In / Providers → Email**, it is on by default.

- **Confirm email**: on by default, so new accounts get a confirmation link. Turn it off if you'd rather people get in immediately.
- **One-time code** (hidden until you set `VITE_AUTH_EMAIL_CODE=true`, after adding custom SMTP below): open **Authentication → Emails → Magic Link** and make sure the template includes the code, for example:
  `<p>Your Tiền Đâu code is <strong>{{ .Token }}</strong></p>`
  The code matters on iPhone: a home-screen app has its own storage, so a sign-in *link* opened from Mail lands in Safari instead of the app. Typing the code keeps you in the app.
- Supabase's built-in email sender is limited to a few emails an hour. For real use, add your own SMTP (Resend, Postmark, SendGrid…) under **Project Settings → Authentication → SMTP**.

### 4. Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/): create a project → **APIs & Services → OAuth consent screen** (External, add your app name and email).
2. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized redirect URI: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
3. Copy the **Client ID** and **Client secret** into Supabase → **Authentication → Sign In / Providers → Google**, and enable it.
4. So Google's screen shows your site instead of `YOUR-PROJECT-REF.supabase.co`: set `VITE_GOOGLE_CLIENT_ID` to the same Client ID (in `.env` and your host's settings), and add your site plus `http://localhost` and `http://localhost:5173` as **Authorized JavaScript origins**. The app then uses Google's own button; without the variable it falls back to the redirect.

### 5. Apple sign-in (optional, needs a paid Apple Developer account, $99/year)

1. In [Apple Developer](https://developer.apple.com/account/resources/identifiers/list): create an **App ID** with *Sign in with Apple* enabled, then a **Services ID** (this is the client ID for the web).
2. Configure the Services ID: domain = `YOUR-PROJECT-REF.supabase.co`, return URL = `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`.
3. Create a **Key** with *Sign in with Apple*, download the `.p8` file.
4. In Supabase → **Authentication → Sign In / Providers → Apple**, enable it and fill in the Services ID, Team ID, Key ID and the `.p8` key (Supabase's page explains each field).
5. Set `VITE_AUTH_APPLE=true` in `.env` (and in your host's settings).

Until then, keep `VITE_AUTH_APPLE=false` so the button stays hidden.

### 6. Allow your app's addresses

Supabase → **Authentication → URL Configuration**:

- **Site URL**: your live address, e.g. `https://pocket-ledger.vercel.app`
- **Redirect URLs**: add the live address and `http://localhost:5173` for development.

### 7. Put it online

**Vercel** (or Netlify, same idea):

1. Push this folder to a GitHub repository.
2. In Vercel → **Add New → Project** → import the repository. It detects Vite automatically.
3. Under **Environment Variables**, add the same values as your `.env`.
4. Deploy. Add the address Vercel gives you to step 6.

### 8. Install it on your phone

- **iPhone**: open the address in Safari → Share → **Add to Home Screen**.
- **Android**: open it in Chrome → menu → **Install app**.

---

## How it fits together

```
src/
  core/        Pure logic with no UI or storage. Reusable as-is in a future React Native / Expo app.
    money.js       currency formatting and rounding
    dates.js       date helpers
    categories.js  categories and the Vietnamese/English keyword matcher
    parser.js      quick add: text → records
    receipt.js     reading a scanned receipt: shop, total and date from OCR text
    bills.js       bill splitting, balances, settle-up suggestions
  data/
    supabase.js    Supabase client and which sign-in buttons to show
    store.js       records on the phone, guest/account modes, moving old server records down, backup
  lib/
    model.js       app logic the screens share: demo data, chat → records, ledger filters
    auth-errors.js plain-language sign-in errors
    use-speech.js  voice input via the browser's speech recognition (Chrome, Edge, Safari)
    ocr.js         on-device receipt reading (Tesseract; engine + vi/en data load from jsDelivr on first use, then cached)
    on-device-ai.js tidies bill text with the browser's own on-device model (Chrome's Gemini Nano) when it has one
    utils.js       cn() class helper used by shadcn/ui
  components/
    ui/            shadcn/ui components (React + Tailwind), themed in styles.css
    app/           the Log, Ledger and Split screens, sign-in, account menu, and their sheets
  App.jsx        app shell: sign-in or the app, header, tabs, the open sheet
  main.jsx       start-up
  styles.css     Tailwind + shadcn theme tokens (jade palette, light and dark)
supabase/migrations/0001_init.sql   delete-my-account function (and the tables older versions synced to)
tests/core.test.js                  tests for the core logic (npm test)
tests/model.test.js                 tests for shared bills and quick add, in both languages
```

**Where records live.** Always in the browser's storage on the phone: under `pl-guest` without an account, and under `pl-acct-<user id>` when signed in, so people sharing a phone keep separate records. Nothing is uploaded. Older versions synced signed-in records to Supabase; on sign-in the app copies any still there onto the phone and then deletes them from the server (only after the phone has saved them).

**Data model.** `tx` holds expenses and income. `bills` holds shared bills and settle-up payments with their split details (who ordered what, fees, payers, the computed shares). `people` are the friends you split with (they don't need accounts), `events` group bills, and `meta` holds settings such as currency and your profile picture.

**Signing out** keeps that account's records on the phone; they're back when you sign in again. Deleting the account removes them.

## Moving to a native app later

When you build an Expo / React Native app:

- Copy `src/core/` as-is. It has no browser or UI code, and `npm test` covers it.
- Use the same Supabase project for accounts; people sign in with the same Google, Apple or email account. Records move over with a backup file.
- Rebuild the screens with React Native components, and port `src/data/store.js` with AsyncStorage instead of `localStorage`.
- Apple requires an in-app way to delete your account; `delete_my_account()` in the database is already there for that.

## Notes

- Sign-in buttons are plain text. If you want the official Google and Apple button styles, follow their branding guidelines (Google Identity "Sign in with Google" branding, Apple "Sign in with Apple" Human Interface Guidelines).
- Quick-add history is stored on the phone too.
- `npm test` runs the core tests; `npm run build` makes the production files in `dist/`.

## Reading bills

Bill photos are read entirely on the phone, free, with nothing sent anywhere:

1. The photo becomes text with Tesseract (its engine and Vietnamese/English data load from jsDelivr the first time, then stay cached).
2. If the browser has an on-device model ready (Chrome's built-in Gemini Nano, the Prompt API; today on desktop Chrome, not yet on Chrome for Android or Safari), it tidies that text into shop, total and items. Any amount it gives that isn't printed on the bill is thrown out.
3. Otherwise the app's own rules (`src/core/receipt.js`) do it.

The app never starts the model's download itself, so phones without it just use the rules. Apple Intelligence and Gemini Nano for Android apps are only open to native apps; a React Native / Expo version could use them (see "Moving to a native app later").
