# rsv.pizza — Event Check-In & Zero-Friction Rewards

> **The phone is the ticket.** No scanners, no QR codes, no staff training. Guests carry the redemption terminal; the bartender taps one giant button and checks a color.

Integration MVP for [rsv.pizza](https://rsv.pizza):

```
contracts/   Foundry · Solidity 0.8.28 · OpenZeppelin 5.4 — RsvpTickets (ERC-1155, soulbound, EIP-712 gated mint)
web/         Next.js 16 App Router on Cloudflare Workers (vinext) · React 19 · Tailwind 4 · Framer Motion · wagmi/viem · Privy · permissionless.js (ERC-4337) · Cloudflare D1
```

**Try the whole journey without any keys (Demo Mode):**

```bash
cd web && npm i && npm run demo     # or plain `npm run dev` with no .env — Demo Mode turns on automatically
```

Open <http://localhost:3000>. To scan the door kiosk with a real phone, open the laptop by its LAN address (e.g. `http://192.168.1.20:3000`) on both devices. In Demo Mode the kiosk key is a fixed per-event value, so codes validate on any device. Put the guest app (`/e/pizza-night-nyc`) and the host dashboard (`/host/pizza-night-nyc`) in two tabs side by side: they share a localStorage mock DB and update each other live. Any email logs a guest in, the Event PIN is **4209**, and the yellow **Demo ▴** dock jumps between personas or resets the data.

---

## How it works

### Journeys

| Persona | Screen | Route |
|---|---|---|
| Guest | **Auth** — email / SMS / Google. Privy silently creates a non-custodial embedded wallet (no seed phrase). | `/e/[eventId]` |
| Guest | **Claim** — types the static Event PIN from the sign in the venue. | `/e/[eventId]` |
| Guest | **Wallet** — "2× Free Drink, 1× Pizza Slice". | `/e/[eventId]` |
| Bartender | **Redeem** — full-height button, **press & hold 1.5 s** (a dark pour fills it; release / slide off cancels). | `/e/[eventId]/redeem/[tokenId]` |
| Bartender | **Success** — full-screen Theme Color of the Night, **today's date** (`TUE, NOV 3`) + live HH:MM:SS, endlessly scrolling diagonal marquee + pulse. Flips to striped **VOID** if the ledger rejects. | (overlay) |
| Door staff | **Door list** — search + big CHECK IN toggle, live counts; marks 📱 self check-ins and ✉ invited guests. | `/host/[eventId]?tab=door` |
| Unmanned door | **Kiosk** — guest-facing iPad/TV with a screen-filling QR that rotates every 30 s; scanning checks the guest in (Layer 1) with no staff. | `/host/[eventId]/kiosk` |
| Host | **Guest ledger** — live balances of every checked-in guest; **Admin redeem** (Host Vouch) and **Transfer** (Wingman) for dead phones; **end-of-night CSV**. | `/host/[eventId]?tab=ledger` |
| Host | **Settings** — Event PIN, Theme Color (manual or auto-rotate every N min, choose palette). Staff-only; `/admin` redirects here. | `/host/[eventId]?tab=settings` |
| Bar staff | **Bar display** — staff-facing "tonight's color" + live clock + rotation countdown. | `/host/[eventId]/display` |

### Requirement 1 — Dual-layer gated minting

```
Guest types PIN ─▶ POST /api/events/:id/claim  (Privy access token)
                    ├─ RSVP matched to the Privy login's verified email / phone
                    ├─ Layer 1  rsvps.status == 'checked_in'      ← door staff toggled it
                    ├─ Layer 2  pin == events.event_pin           ← constant-time, 8-strike lockout
                    ├─ smartAccount == SimpleAccountFactory.getAddress(privyEmbeddedEOA, 0)   ← can't redirect the mint
                    └─ sign EIP-712 ClaimBatch{to, ids, amounts, claimId, deadline} with CLAIM_SIGNER_PRIVATE_KEY
                                    │
Guest smart account ── UserOp ──▶ RsvpTickets.claimTicketsBatch(...)  ── reverts without a valid SIGNER_ROLE signature
```

Code: [`web/src/app/api/events/[eventId]/claim/route.ts`](web/src/app/api/events/[eventId]/claim/route.ts), [`web/src/lib/server/signer.ts`](web/src/lib/server/signer.ts), [`contracts/src/RsvpTickets.sol`](contracts/src/RsvpTickets.sol).

### Requirement 2 — Gasless burn (ERC-4337)

```
Privy embedded EOA (owner, never funded)
   │ signs userOpHash silently (showWalletUIs: false)
   ▼
SimpleAccount v0.7 (counterfactual; deployed by its first UserOp)
   │ execute(RsvpTickets, 0, redeemTicket(self, id, 1))
   ▼
/api/aa  ── auth'd proxy: only RsvpTickets calls, pins sponsorship policy, hides API key
   ▼
Pimlico bundler + verifying paymaster (pays the ETH gas) ──▶ Base (OP-stack L2, ~2 s blocks) ──▶ token lands at 0x…dEaD
```

Code: [`web/src/lib/aa.ts`](web/src/lib/aa.ts), [`web/src/hooks/useSmartAccount.ts`](web/src/hooks/useSmartAccount.ts), [`web/src/hooks/useBurn.ts`](web/src/hooks/useBurn.ts), [`web/src/app/api/aa/route.ts`](web/src/app/api/aa/route.ts).

### Requirement 3 — Optimistic UI + Visual 2FA

```
tap ─┬─▶ same frame   Success screen in the Theme Color already cached by the 4s /me poll   (no network)
     ├─▶ ~100 ms      POST /redemptions → atomic D1 check-and-insert (one statement)         → VOID overlay on 409
     └─▶ ~1–2 s       gasless redeemTicket UserOp (only if the ledger said OK)              → chip: "burned on-chain"
                      failures persist in localStorage and are retried; never re-sent once the bundler accepted it
```

The theme color is computed deterministically from `(palette, rotation_minutes, wall-clock slot)` in [`web/src/lib/theme.ts`](web/src/lib/theme.ts), so every server and the bar display agree without a cron job. It is only returned to guests who have claimed tickets.

### Door & arrival

- **Kiosk QR check-in.** The door screen shows `/e/<id>?kiosk=<code>`, where `code = HMAC-SHA256(event.kiosk_secret, "<eventId>:<30 s step>")` ([`lib/kiosk.ts`](web/src/lib/kiosk.ts)). A code is accepted for its own step and the one before it, so 30–60 s. On landing, the guest's phone strips the param and exchanges the code for a 10-minute signed **presence pass**, because logging in can take longer than the code lives. After login, the pass is redeemed at `POST /api/events/:id/kiosk-checkin`, which sets `status='checked_in', checked_in_by='kiosk'`. The key is regenerated every time kiosk mode is switched off → on. The Event PIN (Layer 2) is still required.
- **Pre-arrival links.** `POST /api/host/:id/magic-links` targets every `rsvpd` + unclaimed guest with an email. It pre-creates their Privy user with a **pregenerated embedded wallet**, binds it to the RSVP, and signs an invite link (`?invite=…`, 3-day expiry). Opening the link pre-fills the login and sends the Privy code automatically. Email goes through [`lib/server/email.ts`](web/src/lib/server/email.ts) (`// TODO` provider). Privy's server SDK cannot mint a log-in-without-code link (that would need Privy custom-JWT auth), so guests type one 6-digit code, at home instead of in line.
- **Clock-drift-proof color.** `/me` returns `serverTime`, the current color, and only the **next** slot, not the palette or rotation config, so the schedule can't be precomputed. The client stores `clockOffset = serverTime − RTT midpoint`. At the redemption frame, `pickTheme(current, next, Date.now() + clockOffset)` picks the color synchronously. A phone that's 5 minutes fast or slow, or one that crossed a rotation boundary between polls or offline, still shows the bartender's color. If it has been offline for more than a whole slot, the color is unknown: the hold is blocked and "↻ Sync connection" is offered.
- **Auto-reset.** Every success screen (guest or Host Vouch) closes itself after 15 s, with a shrinking bar along the top edge, so nobody can walk away with it open and flash it again later.
- **Flashbang.** The success screen opens on pure white with black text for 150 ms, timed per frame (9 frames at 60 Hz, measured 150 ms paint to paint), then hard-cuts to the theme color.
- **↻ Sync connection.** The wallet has a manual hard refetch of `/me`. If an auto-rotating color expired while the guest had no signal, the wallet says so and the REDEEM hold is blocked until they sync. The bartender never sees last slot's color.
- **Batch Host Vouch.** A − n + stepper, capped at the guest's balance for that perk. One hold redeems n tickets, and the success screen shows `n× Free Drink`.

### Hospitality & budget

- **Event budget bar.** Pinned to the top of every host tab: `redeemed / event_budget` (guest + Host Vouch). It's green below 75 %, `#FFD23F` from 75 %, and `#FF1F3D` from 90 %. It also shows how many tickets are still unredeemed and the worst-case tab if they're all used. Set the budget in Event settings, which can suggest one (RSVPs × bundle).
- **Make It Right (🎁 Grant tickets).** Any claimed guest can be granted 1–20 of any ticket type, with a logged reason. `POST /api/host/:id/admin-mint` calls `record_grant()` (the ledger, with staff email and reason), then a sponsored `adminMint` UserOp from the ADMIN_ROLE account. The modal shows the effect on the budget's worst case before you confirm.
- **Ticket configuration.** Event settings edits `events.ticket_types`: emoji, name, check-in amount (0 = grant-only, e.g. 👕 Merch Item), and add or remove types. **Each claim snapshots the bundle it minted** (`rsvps.claimed_bundle`). Changing the allocation mid-event therefore only affects new claims and never creates phantom balances for guests who already claimed. A type that guests already hold can't be deleted; set its amount to 0 instead.
- **Recent redemptions.** `/me` returns the guest's redemptions from the last 30 minutes. The wallet shows them as static receipts (`✓ 1× Pizza Slice — 2 mins ago · 10:42:07 PM`), with Host Vouches labelled, so the bartender has proof even after the success screen closes itself. No theme color is shown, since a history of colors would leak the palette.

### Admin override (dead phone / no signal)

| Action | Ledger | Chain |
|---|---|---|
| **Host Vouch** — host holds *Vouch* for a guest; the Visual 2FA success screen (badged "Host vouch") shows on the **host's** device for the bartender. | `record_redemption(..., source='admin', redeemed_by=<staff email>)` | `adminRedeem(guestWallet, id, 1)` from the host's ADMIN_ROLE smart account, paymaster-sponsored, submitted with `after()` |
| **Wingman Transfer** — move N tickets to another guest who is checked in **and** has claimed (so they have a wallet). | `record_transfer()` locks both guests, checks balance | `adminTransfer(from, to, id, n)`, the only path around the soulbound rule (transient `_adminOverride` flag) |
| **CSV export** — Guest Name, RSVP Status, Minted, Redeemed by Guest, Redeemed by Admin (Vouch), Transferred (net), plus In / Out / Remaining and a TOTAL row. | built in the browser from the ledger feed (Blob download, formula-injection safe) | — |

Setup: put the owner key in `ADMIN_PRIVATE_KEY`, run `npm run admin:address`, and `grantRole(ADMIN_ROLE, <that smart account>)`. Revoke it the same way, or `pause()` to freeze everything.

### Demo Mode

On when `NEXT_PUBLIC_DEMO_MODE=true` or `NEXT_PUBLIC_PRIVY_APP_ID` is empty. The UI only talks to [`lib/backend`](web/src/lib/backend), which is picked once at build time: [`live.ts`](web/src/lib/backend/live.ts) (Privy + API routes + ERC-4337) or [`demo.ts`](web/src/lib/backend/demo.ts) (localStorage mock DB in [`lib/demo/store.ts`](web/src/lib/demo/store.ts), 1 s login, 2 s mint, ~120 ms ledger check, simulated burns). Demo Mode never loads Privy or calls any API route.

---

## Security model (what each layer stops)

| Attack | Stopped by |
|---|---|
| Farming tickets from home / sharing the PIN online | Layer 1: door staff must check you in. The PIN alone mints nothing. |
| Door staff colluding / checking in non-attendees remotely | Layer 2: you must also read the PIN off the physical sign. |
| Replaying or re-using a voucher | `claimId` per RSVP marked used on-chain + 10-min `deadline`. |
| Redirecting a voucher to another wallet, inflating amounts | Recipient, ids, amounts are all inside the signed struct. Server derives the recipient from the Privy wallet. |
| Sending drinks to friends who aren't there | Soulbound `_update`; approvals disabled. |
| Someone else burning your tickets | `redeemTicket` requires `msg.sender == account`. |
| Screenshot / screen-recording of an old success screen | Live ticking clock, today's date (defeats last week's recording), a marquee that never stops moving (a paused video freezes), and color rotation. |
| Guest burning a ticket by bumping their phone in line | 1.5 s press-and-hold. Moving the finger 40 px, releasing, or scrolling cancels it. |
| Photo of the kiosk QR texted to a friend at home | The code rotates every 30 s and dies within 60 s. The friend would also need the Event PIN from the sign inside (Layer 2). A pass already obtained lives only in that tab's sessionStorage for 10 min. |
| Guest learning tonight's color in advance | The color picker, preview and bar display exist only behind staff login. The REDEEM button is always brand tomato, never the theme color. |
| Admin key compromise | `ADMIN_ROLE` is separate from deployer/signer roles, only used server-side after a staff login, every action logged with the staff email; revocable; `pause()` stops it. |
| Look-alike page built by someone without tickets | Needs tonight's color, which is only served to claimed ticket holders, and rotates. |
| Same account on two phones redeeming the last drink | Atomic D1 ledger: one `INSERT … SELECT … WHERE balance >= n` statement (D1 runs statements serially), so the second phone flips to **VOID** in ~100 ms. Tested with 10 parallel redemptions for 1 drink (exactly 1 wins). |
| Paymaster drain | `/api/aa` requires a Privy session and only sponsors UserOps whose every call targets `RsvpTickets` with value 0; plus Pimlico sponsorship policy. |

Honest limits (fine for an MVP, worth saying in the pitch): Visual 2FA is a *speed bump* against a determined insider who holds a ticket and builds a fake app — a claimed guest's browser does prefetch the current color (that is what makes the success screen instant), so it's readable from dev tools; the on-chain burn lags the pour by ~1–2 s by design; the PIN lockout counter is per-RSVP, not per-IP.

---

## Setup

### 1. Contracts

```bash
cd contracts
git submodule update --init --recursive
forge test
```

Deploy to Base Sepolia (see [`contracts/README.md`](contracts/README.md)) with `SIGNER_ADDRESS` = the address of the key you'll put in `CLAIM_SIGNER_PRIVATE_KEY`. Set `NEXT_PUBLIC_CHAIN=baseSepolia` (or `base`) to match. The EIP-712 domain is bound to `block.chainid`, so a mismatch makes every claim fail.

### 2. Cloudflare D1 (database)

The app runs on **Cloudflare Workers** (via [vinext](https://github.com/cloudflare/vinext)) with a **D1** database bound as `DB` in [`web/cloudflare.config.ts`](web/cloudflare.config.ts). The production database `rsvpizza` (`4c79d4e7-b9b3-4438-97a1-70ea79e21a64`, eastern North America) already exists, with [`web/migrations/0001_init.sql`](web/migrations/0001_init.sql) applied and the demo event seeded.

```bash
cd web
npx cf auth login                 # once
npm run db:migrate                # apply any new files in web/migrations to production D1
npm run db:migrate:local && npm run db:seed:local   # local D1 for `npm run dev` / `npm start`
```

New schema changes go in a new `web/migrations/000N_*.sql` file. In production the `rsvps` table is filled from rsv.pizza's RSVP list. Emails must be stored lower-case and phones as E.164 ([`web/d1/seed.sql`](web/d1/seed.sql) shows the shape).

### 3. Privy

Create an app, enable **Email, SMS, Google**, and turn on **embedded wallets → Ethereum**. Copy the App ID and secret.

### 4. Pimlico

Create an API key and a **sponsorship policy** on **Base / Base Sepolia**, restricted to your `RsvpTickets` address. The app calls `api.pimlico.io/v2/<8453|84532>/rpc` automatically from `NEXT_PUBLIC_CHAIN`.

### 5. Web (Cloudflare Workers)

```bash
cd web
cp .env.example .env            # public build-time settings (NEXT_PUBLIC_*)
cp .dev.vars.example .dev.vars  # server secrets for local dev
npm install
npm run dev                     # Vite + workerd, real local D1
```

Deploy:

```bash
npx cf workers secrets put PRIVY_APP_SECRET    # …and each other name in .dev.vars.example
npm run deploy                                 # build + deploy the Worker "rsvpizza"
```

- Guest: `http://localhost:3000/e/pizza-night-nyc` (log in with a seeded email)
- Host / door: `http://localhost:3000/host/pizza-night-nyc` (log in with an email in `HOST_EMAILS`)

### Checks

```bash
cd contracts && forge test                         # 36 tests: vouchers, replay, expiry, soulbound fuzz, redeem, admin override, roles, pause
cd web && npm run typecheck && npm run lint && npm run build
cd web && npm run test:db                          # 37 ledger/repo tests on a real local D1 (incl. parallel double-spend races)
anvil --chain-id 84532 --optimism &                # local OP-stack node posing as Base Sepolia
cd web && npm run verify:voucher                   # e2e on "Base": EIP-712 domain, cross-chain replay, claim, admin overrides
```

---

## Where this deviates from the brief, and why

- **`claimTickets` takes two extra params (`claimId`, `deadline`).** The brief's `claimTickets(to, id, amount, signature)` can't stop the same signature from being replayed. `claimTicketsBatch` was added so one gasless UserOp mints the whole bundle.
- **Redemption uses `_update(account, 0x…dEaD)` instead of `_burn`.** That matches "send to the dEaD address" and gives a public "drinks poured" counter (`balanceOf(0x…dEaD, id)`), without running receiver hooks.
- **Tokens are only moved by the holder.** Approvals are disabled, so the guest's own smart account calls `redeemTicket`; the bartender's tap is what triggers that call on the guest's phone.
- **Bundler/paymaster go through a server proxy** rather than putting the Pimlico key in the browser.
- **Cloudflare instead of Supabase.** The database is D1 (SQLite) and the app runs on Workers via vinext. Postgres's `plpgsql` functions and advisory locks became single atomic `INSERT … SELECT … WHERE` statements in [`web/src/lib/server/ledger.ts`](web/src/lib/server/ledger.ts).
- **An off-chain ledger runs alongside the chain.** Optimistic UI needs a double-spend check that answers in about 100 ms, which block confirmation can't.

## Project map

```
contracts/src/RsvpTickets.sol                 ERC-1155 + EIP-712 + soulbound + AccessControl + Pausable
contracts/test/RsvpTickets.t.sol              Foundry tests (incl. fuzz)
contracts/script/Deploy.s.sol
web/src/app/api/events/[eventId]/claim        PIN + check-in verification → EIP-712 voucher
web/src/app/api/events/[eventId]/redemptions  atomic off-chain ledger (optimistic double-spend guard)
web/src/app/api/events/[eventId]/me           guest status + pre-fetched theme color
web/src/app/api/aa                            ERC-4337 bundler/paymaster proxy (Pimlico)
web/src/app/api/host/[eventId]/…              guest list + ledger, check-in toggle, PIN + theme settings,
                                              Host Vouch (guests/[rsvpId]/redeem), Wingman (transfers)
web/src/lib/backend/{live,demo}.ts            one UI, two backends (Demo Mode)
web/src/lib/server/adminAccount.ts            ADMIN_ROLE smart account (sponsored adminRedeem / adminTransfer)
web/src/lib/csv.ts                            end-of-night report
web/src/lib/aa.ts                             smart-account client, sendClaim, sendRedeem
web/src/lib/theme.ts                          Visual 2FA palette + deterministic rotation
web/src/components/guest/*                    Auth, Claim, Wallet, Redeem, Success, LiveClock
web/src/components/guest/HoldToRedeem.tsx     1.5 s long-press trigger with contrast-aware fill
web/src/components/host/*                     Door list, Master ledger, Host Vouch, Wingman Transfer, Settings, CSV
web/migrations/0001_init.sql                  D1 (SQLite) schema
web/src/lib/server/{d1,repo,ledger}.ts        D1 binding, event/RSVP repository, atomic ledger writes
web/cloudflare.config.ts                      Worker config: D1 binding, declared secrets
web/scripts/test/d1-ledger.test.ts            ledger tests against local D1 (Miniflare)
```
