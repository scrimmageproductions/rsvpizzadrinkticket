# rsv.pizza — Event Check-In & Zero-Friction Rewards

> **The phone is the ticket.** No scanners, no QR codes, no staff training. Guests carry the redemption terminal; the bartender taps one giant button and checks a color.

Integration MVP for [rsv.pizza](https://rsv.pizza):

```
contracts/   Foundry · Solidity 0.8.28 · OpenZeppelin 5.4 — RsvpTickets (ERC-1155, soulbound, EIP-712 gated mint)
web/         Next.js 16 (App Router) · React 19 · Tailwind 4 · Framer Motion · wagmi/viem · Privy · permissionless.js (ERC-4337) · Supabase
```

**Try the bartender moment without any keys:** `cd web && npm i && npm run dev` → <http://localhost:3000/demo>

---

## How it works

### Journeys

| Persona | Screen | Route |
|---|---|---|
| Guest | **Auth** — email / SMS / Google. Privy silently creates a non-custodial embedded wallet (no seed phrase). | `/e/[eventId]` |
| Guest | **Claim** — types the static Event PIN from the sign in the venue. | `/e/[eventId]` |
| Guest | **Wallet** — "2× Free Drink, 1× Pizza Slice". | `/e/[eventId]` |
| Bartender | **Redeem** — full-height REDEEM button (fires on pointer-down). | `/e/[eventId]/redeem/[tokenId]` |
| Bartender | **Success** — full-screen Theme Color of the Night, shock-wave + emoji burst, live HH:MM:SS clock. Flips to striped **VOID** if the server rejects. | (overlay) |
| Door staff | **Guest list** — search + big CHECK IN toggle, live counts. | `/host/[eventId]` |
| Host | **Settings** — Event PIN, Theme Color (manual or auto-rotate every N min, choose palette). | `/host/[eventId]` → Event settings |
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
Pimlico bundler + verifying paymaster (pays AVAX) ──▶ Avalanche C-Chain ──▶ token lands at 0x…dEaD
```

Code: [`web/src/lib/aa.ts`](web/src/lib/aa.ts), [`web/src/hooks/useSmartAccount.ts`](web/src/hooks/useSmartAccount.ts), [`web/src/hooks/useBurn.ts`](web/src/hooks/useBurn.ts), [`web/src/app/api/aa/route.ts`](web/src/app/api/aa/route.ts).

### Requirement 3 — Optimistic UI + Visual 2FA

```
tap ─┬─▶ same frame   Success screen in the Theme Color already cached by the 4s /me poll   (no network)
     ├─▶ ~100 ms      POST /redemptions → Postgres record_redemption() (advisory-locked)    → VOID overlay on 409
     └─▶ ~1–2 s       gasless redeemTicket UserOp (only if the ledger said OK)              → chip: "burned on-chain"
                      failures persist in localStorage and are retried; never re-sent once the bundler accepted it
```

The theme color is computed deterministically from `(palette, rotation_minutes, wall-clock slot)` in [`web/src/lib/theme.ts`](web/src/lib/theme.ts), so every server and the bar display agree without a cron job. It is only returned to guests who have claimed tickets.

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
| Screenshot / screen-recording of an old success screen | Live ticking clock + animated stripes + color rotation. |
| Look-alike page built by someone without tickets | Needs tonight's color, which is only served to claimed ticket holders, and rotates. |
| Same account on two phones redeeming the last drink | Atomic Postgres ledger (`record_redemption`, advisory lock) → second phone flips to **VOID** in ~100 ms. |
| Paymaster drain | `/api/aa` requires a Privy session and only sponsors UserOps whose every call targets `RsvpTickets` with value 0; plus Pimlico sponsorship policy. |

Honest limits (fine for an MVP, worth saying in the pitch): Visual 2FA is a *speed bump* against a determined insider who holds a ticket and builds a fake app; the on-chain burn lags the pour by ~1–2 s by design; the PIN lockout counter is per-RSVP, not per-IP.

---

## Setup

### 1. Contracts

```bash
cd contracts
git submodule update --init --recursive
forge test
```

Deploy to Fuji (see [`contracts/README.md`](contracts/README.md)) with `SIGNER_ADDRESS` = the address of the key you'll put in `CLAIM_SIGNER_PRIVATE_KEY`.

### 2. Supabase

Run [`web/supabase/migrations/0001_init.sql`](web/supabase/migrations/0001_init.sql), then [`web/supabase/seed.sql`](web/supabase/seed.sql) (edit the seed emails to your own). In production the `rsvps` table is filled from rsv.pizza's RSVP list. Emails must be stored lower-case and phones as E.164.

### 3. Privy

Create an app, enable **Email, SMS, Google**, and turn on **embedded wallets → Ethereum**. Copy the App ID and secret.

### 4. Pimlico

Create an API key and a **sponsorship policy** restricted to your `RsvpTickets` address on Avalanche / Fuji.

### 5. Web

```bash
cd web
cp .env.example .env.local   # fill everything in
npm install
npm run dev
```

- Guest: `http://localhost:3000/e/pizza-night-nyc` (log in with a seeded email)
- Host / door: `http://localhost:3000/host/pizza-night-nyc` (log in with an email in `HOST_EMAILS`)

### Checks

```bash
cd contracts && forge test                         # 20 tests: vouchers, replay, expiry, soulbound fuzz, redeem, roles, pause
cd web && npm run typecheck && npm run lint && npm run build
anvil & cd web && npm run verify:voucher           # e2e: backend-signed voucher accepted by the real contract on anvil
```

---

## Where this deviates from the brief, and why

- **`claimTickets` takes two extra params (`claimId`, `deadline`).** The brief's `claimTickets(to, id, amount, signature)` can't stop the same signature from being replayed. `claimTicketsBatch` was added so one gasless UserOp mints the whole bundle.
- **Redemption uses `_update(account, 0x…dEaD)` instead of `_burn`.** That matches "send to the dEaD address" and gives a public "drinks poured" counter (`balanceOf(0x…dEaD, id)`), without running receiver hooks.
- **Tokens are only moved by the holder.** Approvals are disabled, so the guest's own smart account calls `redeemTicket`; the bartender's tap is what triggers that call on the guest's phone.
- **Bundler/paymaster go through a server proxy** rather than putting the Pimlico key in the browser.
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
web/src/app/api/host/[eventId]/…              guest list, check-in toggle, PIN + theme settings
web/src/lib/aa.ts                             smart-account client, sendClaim, sendRedeem
web/src/lib/theme.ts                          Visual 2FA palette + deterministic rotation
web/src/components/guest/*                    Auth, Claim, Wallet, Redeem, Success, LiveClock
web/src/components/host/*                     Guest list, Settings, Bar display
web/supabase/migrations/0001_init.sql         schema + record_redemption()
```
