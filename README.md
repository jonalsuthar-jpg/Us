# Us

A private space for exactly two people: video and voice calls, screen sharing, a chat thread with read receipts and typing, and relationship tools for connecting, planning, remembering and growing together.

```
apps/
  web/        Next.js 16 (App Router) · Tailwind · Radix · Framer Motion   — primary for screen sharing
  mobile/     Expo SDK 58 (expo-router) · NativeWind · react-native-webrtc — primary for calls & daily use
packages/
  shared/     design tokens + Tailwind preset · typed Supabase API · realtime channel ·
              WebRTC CallManager · React providers/hooks (used by both apps)
supabase/
  migrations/ schema + Row Level Security (phases 1–6; Connect has Daily Question built, the rest schema-only)
  functions/  push (OneSignal) · turn-credentials (Metered) · delete-account · fight-translator (phase 3 stub)
scripts/      test-db (RLS tests on PGlite) · generate-sounds · generate-icons
```

## What's built

| Phase | Status |
|---|---|
| 1 · Foundation | Monorepo (npm workspaces + Turborepo), Supabase schema, email/password + magic-link auth, password reset (link signs you in and opens Settings → Password), invite-code pairing, design system on web and mobile |
| 2 · Talk | **Chat extras:** photos and voice notes (private `chat` Storage bucket, `<couple_id>/<message_id>.<ext>`), reply-to with tap-to-jump quotes, one reaction each (❤️ 😂 😮 😢 👍 🔥) via `react_to_message()`, pinned messages for both via `pin_message()` with a pinned bar, and search over the thread. Reactions and pins are updates on the message row, so they arrive live through the existing Postgres Changes stream. 1:1 WebRTC video and voice calls, signaled over a private Supabase Realtime channel. Mute, camera, front/back camera flip (mobile, and web when the device has two cameras), speaker/earpiece toggle on mobile (`react-native-incall-manager`, headsets take over automatically), output-device picker on desktop browsers, web screen sharing (mobile gets a nudge to use the web app). TURN via Metered. Persistent chat with sent ✓ / delivered ✓✓ / read ✓✓ receipts, typing indicator, presence, missed-call entries with call-back, push notifications, custom chime and ringtone |
| 3 · Connect | **Daily Question**: one shared prompt a day from a 40-question bank (no repeats per couple), answers sealed once sent and hidden until you've both answered (`daily_history()` reveals), a both-answered streak, and a push to your partner when you answer. Fight Translator, Future Letters and Inside Jokes have tightened RLS (authors are always yourself; reveal and unlock state is server-only) but no UI yet (`TODO(phase-3)`) |
| 4 · Plan | **Shared lists** (groceries, bucket list, to watch, to read) that either of you ticks off. Shared calendar (month grid, all-day / timed plans), decision picker (weighted, recently-picked options deprioritised, server-side `pick_decision`), invisible-labour balance over 30 days, shared costs with per-currency settle-up |
| 5 · Memory | Timeline with photos in a private Storage bucket (`memories/<couple_id>/…`, signed URLs), moments / dates / trips, *On this day*, a private "how it felt" rating and note on each memory |
| 6 · Growth | Goal board (yours / theirs / ours), private mood check-ins with an optional soft nudge (partner sees only *that* you asked — `partner_nudges()` returns timestamps), worry space with opt-in sharing, love-language quiz with opt-in sharing and a daily idea |
| Dark mode | Web and mobile. Follows the device by default; Settings → Appearance overrides it per device |
| Together (Home) | **Coming up:** your countdowns (trips, yearly birthdays and anniversaries) merged with relationship milestones (100, 200, 500, 1,000 days… and each anniversary of pairing). **Thinking of you:** one tap sends a push and, if your partner has Us open, a heart and a haptic pulse anywhere in the app (at most one every 10 s). **Safe home:** ask your partner to say when they're home, or offer to; only the traveller can mark it arrived (`mark_arrived()`), and a "home spot" saved on the device (never uploaded) lets the app mark it for you when it sees you're back. **Location sharing:** opt-in for 1, 8 or 24 hours; your partner can read it only while the window is open, and stopping wipes the coordinates server-side |
| Leaving | Settings → Leaving. **Unpair** (`unpair()`) deletes everything the couple shared, including the photo folder, and keeps each person's private data. **Delete my account** calls the `delete-account` Edge Function. A partner with the app open is moved to the pair screen |

## Prerequisites

- Node 20+ (22 recommended), npm 9+
- A Supabase project ([supabase.com](https://supabase.com), free tier is fine)
- Optional: OneSignal app (push), Metered.ca account (TURN)
- For mobile: Xcode and/or Android Studio. **Calls and push need a development build — they do not work in Expo Go** (react-native-webrtc and OneSignal are native modules)

```bash
npm install
```

## 1. Supabase

1. Create a project. From **Project Settings → API**, copy the project URL and the anon (publishable) key.
2. Apply the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   (Or paste each file in `supabase/migrations/` into the SQL editor, in filename order.)
3. **Realtime → Settings:** turn **off** "Allow public access", so only private channels are allowed. The migration adds Realtime Authorization policies that restrict `couple:<id>` (typing, presence, call signaling) to its two members.
4. **Authentication → URL configuration:** set Site URL to your web origin and add `<origin>/auth/callback` and `us://` as redirect URLs. Email confirmation is your choice: if it's on, people confirm before pairing.
5. Deploy the Edge Functions and set their secrets:
   ```bash
   cp supabase/functions/.env.example supabase/functions/.env   # fill in
   npx supabase secrets set --env-file supabase/functions/.env
   npx supabase functions deploy push
   npx supabase functions deploy turn-credentials
   npx supabase functions deploy delete-account
   # after pulling new push categories (thinking of you, location, arrival), redeploy push too
   npx supabase functions deploy fight-translator   # phase 3 stub, optional
   ```

**Verify the security model locally** (no Docker needed; runs every migration on in-process Postgres):
```bash
npm run test:db
```

## 2. TURN (Metered.ca)

Calls try a direct peer-to-peer path first and fall back to TURN when NAT blocks it. ICE handles the fallback automatically once TURN servers are supplied.

1. Create a free app at [metered.ca](https://www.metered.ca/) → **TURN Server**.
2. Set `METERED_DOMAIN` (e.g. `yourapp.metered.live`) and `METERED_API_KEY` as function secrets. The `turn-credentials` function fetches short-lived credentials server-side, so no TURN secret ships in a client.
3. Any other TURN provider (or coturn) works through `TURN_URLS` / `TURN_USERNAME` / `TURN_CREDENTIAL`.
4. To prove the relay works, set `NEXT_PUBLIC_FORCE_TURN_RELAY=true` (or `EXPO_PUBLIC_…`). Calls then show a **Relayed** badge.

## 3. OneSignal (push)

1. Create one OneSignal app and enable **Web**, **Apple iOS (APNs)** and **Google Android (FCM)**.
2. **Settings → Keys & IDs:** the App ID goes in both apps' env files; the REST API key goes in function secrets as `ONESIGNAL_REST_API_KEY`.
3. **Android channels** (Settings → Push → Android Notification Channels): create
   - **Messages**: default importance, sound `us_chime`
   - **Calls**: urgent importance, sound `us_ring`

   Put their ids in `ONESIGNAL_ANDROID_CHANNEL_MESSAGES` / `_CALLS`.
4. Web push: `apps/web/public/OneSignalSDKWorker.js` is already in place. In OneSignal's web config, set the site URL to your web origin (localhost is allowed for testing).

Devices are linked to people by `external_id` = Supabase user id (`OneSignal.login`), so the `push` function targets the partner directly.

**Notification categories** (see `supabase/functions/push/index.ts`): incoming call (time-sensitive, ring sound, 45 s TTL, Answer/Decline, replaced by "Missed call" on cancel) · new message (chime, sender avatar, preview, Reply) · typing (never pushed) · wellbeing nudge · daily question (your partner answered; never carries the answer) · resurfaced memory and unlocked letter (defined; triggered in later phases).

**The sound.** `us_chime.wav` (a soft E5→B5 bell) and `us_ring.wav` are synthesized by `npm run sounds`, so they're reproducible and license-free. They're bundled into iOS and Android by `onesignal-expo-plugin` (`sounds` in `app.config.ts`) and played in-app on web. Browsers don't allow custom sounds for background web push; there the OS default plays.

## 4. Web app

```bash
cp apps/web/.env.example apps/web/.env.local   # fill in
npm run dev:web                                 # http://localhost:3000
```

- `/design` shows the whole component library (no sign-in needed).
- `/dev/call-lab` (dev only) runs two real WebRTC peers in one tab with synthetic media, a quick way to exercise the call engine without two devices.
- `NEXT_PUBLIC_*` values are inlined at build time. Rebuild after changing them.

## 5. Mobile app

```bash
cp apps/mobile/.env.example apps/mobile/.env    # fill in; set IOS_BUNDLE_ID / ANDROID_PACKAGE
cd apps/mobile
npx expo prebuild            # generates ios/ and android/ with WebRTC + OneSignal configured
npx expo run:ios             # or: npx expo run:android  (builds and installs a dev client)
npm run start                # Metro, for later sessions
```

- iOS push needs an APNs key uploaded to OneSignal and a real device. For TestFlight/App Store builds, set `ONESIGNAL_MODE=production`.
- EAS Build works too: `npx eas build --profile development`.

## How it fits together

- **Pairing:** `create_invite()` returns an 8-character code (no 0/O/1/I). `redeem_invite(code)` creates the `couples` row: A = creator (rose), B = joiner (teal). Nobody can be in two couples, couples can't be edited or deleted by clients, and every couple-scoped table checks `couple_id = current_couple_id()` in RLS.
- **Chat:** messages carry a client-generated UUID (optimistic UI, idempotent retry). Receipts move forward only through `ack_messages()`: any open client of the recipient marks messages delivered, and the open thread marks them read. Postgres Changes stream inserts and receipt updates. Typing and presence are ephemeral broadcast and presence on the private channel, never stored.
- **Calls:** `CallManager` (`packages/shared/src/webrtc`) is platform-agnostic: browser WebRTC on web, react-native-webrtc on mobile. The caller always makes the offer, and both sides keep an audio and a video transceiver for the whole call, so camera on/off, switching voice to video, and screen sharing are `replaceTrack` swaps with no renegotiation. It also handles glare (both press call at once), answering on another device, ICE restarts and ring timeouts. Every finished call is logged into the thread by a DB trigger.
- **Privacy:** private data (mood notes, check-ins, letter bodies, daily answers, fight entries) lives in owner-only tables, never in shared ones. "Reveal" features expose content through definer functions only once their condition holds. In the UI, every surface carries a badge: *Shared with {name}* (linked circles), *Only you* (lock), or *Hidden until you've both answered* (hourglass).

## Design system

Tokens live in `packages/shared/src/tokens.js` and feed one Tailwind preset used by both Tailwind (web) and NativeWind (mobile).

- Colour: deep plum `#2A1F2D` · paper `#FAF6F1` · rose clay `#C8686B` (partner A, primary) · dusty teal `#4A6670` (partner B) · warm gold `#C99A44` (highlights, memories, read receipts) · sage `#7C8B6F` (growth). Text and button fills use deeper stops so they meet WCAG AA (e.g. rose-600 `#9E4247` gives 5.6:1 with white).
- Type: Fraunces (soft, slightly wonky) for names, moments and memories. Work Sans for UI and body text.
- Motion: one moment per screen. On auth, the two circles meet. On calls, the partner's initial breathes in their colour. On pairing, the seal closes. `prefers-reduced-motion` is respected (CSS, Framer `reducedMotion="user"`, Reanimated `useReducedMotion`).
- Components exist on both platforms with matching APIs: Button, IconButton, Field, Segmented, Chip, Sheet (paper / inset / note / night), Avatar, Seal, PrivacyBadge, Ticks, chat Bubble, TypingBubble, CallEntry, Composer, call screen.
- Dark mode: role colours (paper, ink, the pale washes and the deep text stops on them) are `--us-*` CSS variables defined in `packages/shared/src/theme.js`. Web sets them per `data-theme`; mobile provides them with NativeWind `vars()` from `ThemeProvider`. Brand fills and night (call) surfaces don't change.

## Scripts

| | |
|---|---|
| `npm run typecheck` | all workspaces |
| `npm run test` | shared unit tests (typing timers, receipts merge, CallManager state machine incl. glare / multi-device) |
| `npm run test:db` | migrations + RLS/security assertions on PGlite |
| CI | `.github/workflows/ci.yml` runs typecheck, unit tests, `test:db` and the web build on every PR |
| `npm run build` | web production build |
| `npm run sounds` / `node scripts/generate-icons.mjs` | regenerate audio / icons |
| `npm run db:types` | regenerate DB types from a linked project |

## Known limitations / next steps

- **Lock-screen ringing:** incoming calls arrive as time-sensitive pushes with a ring sound and open the full-screen call UI when tapped. A native full-screen call UI while the phone is locked (CallKit + PushKit on iOS, ConnectionService on Android) needs `react-native-callkeep` and VoIP pushes. `USE_FULL_SCREEN_INTENT` is already declared.
- **Inline notification reply:** the Reply action deep-links into the composer. A true text-input reply needs native notification categories.
- **Edge Functions** were written against Supabase's Deno runtime but not executed here (no Deno or Docker in the build environment). Deploy them and run a first call to confirm.
- **On this day** shows in-app; a scheduled `memory_resurfaced` push (pg_cron + Edge Function) isn't wired yet.
- Mobile date entry uses a day stepper and typed times rather than a native picker (no extra native module). Swap in `@react-native-community/datetimepicker` if you prefer.
- Plan / Memory / Growth refresh live via a data-free "changed" ping on the private couple channel, not Postgres Changes, so nothing extra is published.
- Dark mode was checked on web; on mobile the bundle compiles with the theme variables, but give it a look on a device.
- **Future letter bodies** are stored as `bytea` without encryption yet (pgsodium / Vault is the plan) — build that before the Future Letters UI.
- **Daily Question** uses each person's local date, so partners in very different time zones can briefly be on different days' questions.
- **Location** updates only while Us is open (foreground permission only), and "I'm home" is detected when you open the app, not by a background geofence. Background tracking would need `expo-task-manager` and "Always" permission, which Us deliberately doesn't ask for.
- **New native module:** the mobile app now uses `expo-location`, so build a new development / store binary; an over-the-air update alone won't include it.
- **Voice notes** are recorded as WebM/Opus in Chrome and Firefox and as M4A on phones and Safari. Very old iPhones may not play WebM.
