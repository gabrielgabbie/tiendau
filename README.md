# Tiền Đâu

Log spending and income in seconds, and split bills with friends. An installable web app (PWA) for iPhone and Android, with accounts and sync through [Supabase](https://supabase.com).

- **Quick add**: type `phở 55k, grab 32k` or `dinner 1.2tr với An, Bình #Dalat ship 30k`. Rules on the device read it; no AI and nothing sent anywhere except your own database.
- **Ledger**: filter by day, month, year or a date range, by type and category, and sort by date or amount.
- **Split**: shared bills with per-person items, fees and discounts that each split their own way, several payers, events, and settle-up suggestions.
- **Accounts**: sign in with Google, Apple, or email (password or a one-time code). Records sync live across devices and keep working offline.
- **Guest mode**: use it without an account; sign in later and bring your records with you.
- **Backup**: export everything to a file and restore it.

---

## Setup (about 20 minutes)

You need a free Supabase account, a free hosting account (Vercel or Netlify), and Node.js 18+ on your computer.

### 1. Create the database

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick a region close to you (Singapore for Vietnam) and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste everything from `supabase/migrations/0001_init.sql`, and press **Run**. Then do the same with `supabase/migrations/0002_event_photos.sql` (event cover photos). If your database was set up before, run just `0002`.
   This creates the tables, makes every row private to its owner (Row Level Security), turns on live sync, and adds the "delete my account" function.
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
- **One-time code**: open **Authentication → Emails → Magic Link** and make sure the template includes the code, for example:
  `<p>Your Tiền Đâu code is <strong>{{ .Token }}</strong></p>`
  The code matters on iPhone: a home-screen app has its own storage, so a sign-in *link* opened from Mail lands in Safari instead of the app. Typing the code keeps you in the app.
- Supabase's built-in email sender is limited to a few emails an hour. For real use, add your own SMTP (Resend, Postmark, SendGrid…) under **Project Settings → Authentication → SMTP**.

### 4. Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/): create a project → **APIs & Services → OAuth consent screen** (External, add your app name and email).
2. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized redirect URI: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
3. Copy the **Client ID** and **Client secret** into Supabase → **Authentication → Sign In / Providers → Google**, and enable it.

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
    bills.js       bill splitting, balances, settle-up suggestions
  data/
    supabase.js    Supabase client and which sign-in buttons to show
    store.js       local cache, offline queue, live sync, guest mode, backup
  lib/
    model.js       app logic the screens share: demo data, chat → records, ledger filters
    auth-errors.js plain-language sign-in errors
    use-speech.js  voice input via the browser's speech recognition (Chrome, Edge, Safari)
    utils.js       cn() class helper used by shadcn/ui
  components/
    ui/            shadcn/ui components (React + Tailwind), themed in styles.css
    app/           the Log, Ledger and Split screens, sign-in, account menu, and their sheets
  App.jsx        app shell: sign-in or the app, header, tabs, the open sheet
  main.jsx       start-up
  styles.css     Tailwind + shadcn theme tokens (jade palette, light and dark)
supabase/migrations/0001_init.sql   tables, privacy rules, live sync
supabase/migrations/0002_event_photos.sql   cover photos for events
tests/core.test.js                  tests for the core logic (npm test)
tests/model.test.js                 tests for shared bills and quick add, in both languages
```

**Data model.** `transactions` holds expenses and income. `bills` holds shared bills and settle-up payments; the split details (who ordered what, fees, payers, the computed shares) are in its `data` column. `people` are the friends you split with (they don't need accounts), `events` group bills, and `settings` holds currency. Every table has `user_id` and a policy that only lets the signed-in person see and change their own rows.

**Offline.** The app keeps a copy of your records on the device. Changes made offline wait in a queue and are sent when you're back online; the dot on the settings button shows when something is waiting.

**Signing out** removes that account's records from the device (they stay safe in your account), so a shared phone doesn't keep someone else's data.

## Moving to a native app later

When you build an Expo / React Native app:

- Copy `src/core/` as-is. It has no browser or UI code, and `npm test` covers it.
- Use the same Supabase project. Accounts, records and privacy rules carry over; people sign in with the same Google, Apple or email account and see the same data.
- Rebuild the screens with React Native components, and port `src/data/store.js` with AsyncStorage instead of `localStorage`.
- Apple requires an in-app way to delete your account; `delete_my_account()` in the database is already there for that.

## Notes

- Sign-in buttons are plain text. If you want the official Google and Apple button styles, follow their branding guidelines (Google Identity "Sign in with Google" branding, Apple "Sign in with Apple" Human Interface Guidelines).
- Quick-add history is stored per device and isn't synced; the records it creates are.
- `npm test` runs the core tests; `npm run build` makes the production files in `dist/`.
