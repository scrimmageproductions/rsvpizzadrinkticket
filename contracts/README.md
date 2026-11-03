# RsvpTickets — contracts

Soulbound, signature-gated ERC-1155 perks (drinks, pizza slices) for rsv.pizza events.

| Function | Who calls it | What it does |
|---|---|---|
| `claimTickets(to, id, amount, claimId, deadline, sig)` | guest smart account (gasless) | Mints one perk type if `sig` is a valid EIP-712 `Claim` voucher from a `SIGNER_ROLE` key |
| `claimTicketsBatch(to, ids[], amounts[], claimId, deadline, sig)` | guest smart account (gasless) | Same, for the whole bundle (2× drink + 1× pizza) in one UserOperation — what the app uses |
| `redeemTicket(account, id, amount)` | the holder only (`msg.sender == account`) | Moves the perk to `0x…dEaD` |
| `adminRedeem(account, id, amount)` | `ADMIN_ROLE` (host's server smart account) | Host Vouch: burns a guest's ticket to `0x…dEaD` when their phone is dead |
| `adminTransfer(from, to, id, amount)` | `ADMIN_ROLE` | Wingman Transfer: moves tickets between two guests; the only bypass of the soulbound rule |
| `adminMint(to, id, amount)` | `ADMIN_ROLE` | "Make It Right": grant extra perks mid-event (still soulbound, still redeemable) |
| `pause / unpause / setURI` | `OPERATOR_ROLE` | Emergency stop (also blocks admin actions), metadata |
| `grantRole / revokeRole(SIGNER_ROLE, …)` | `DEFAULT_ADMIN_ROLE` | Rotate the backend signer |

**Soulbound:** `_update` reverts unless it is a mint (`from == 0`), a burn (`to == 0`), a redemption (`to == 0x…dEaD`), or happens inside `adminTransfer` (a transient `_adminOverride` flag, cleared in the same call and automatically at the end of the transaction). `setApprovalForAll` always reverts, so apart from `ADMIN_ROLE` nobody but the holder can move a ticket.

**Replay protection:** every voucher carries a `claimId` (backend derives it from `eventId + rsvpId`) that is marked used on first mint, plus a short `deadline`. The backend can safely re-issue a voucher for the same RSVP (e.g. after a failed UserOp) — only one can ever execute.

> **Chain binding:** nothing in the contract is chain-specific. The EIP-712 domain (`RsvPizzaTickets`, v1) uses `block.chainid` (8453 Base / 84532 Base Sepolia), so vouchers can't be replayed across chains (tested in `test_voucher_boundToChainId_base` and `web/scripts/verify-voucher.ts`). Base supports Cancun opcodes, including the transient storage `adminTransfer` uses.
>
> **Moving from Avalanche:** tokens don't move between chains. Deploy fresh on Base, grant `SIGNER_ROLE` / `ADMIN_ROLE`, and point `NEXT_PUBLIC_TICKETS_ADDRESS` + `NEXT_PUBLIC_CHAIN` at it.

> **Upgrading an existing deployment:** the contract is not upgradeable. `adminMint` (added after the first release) requires a redeploy. Re-grant `SIGNER_ROLE` / `ADMIN_ROLE` and update `NEXT_PUBLIC_TICKETS_ADDRESS`.

## Commands

```bash
forge build
forge test -vv
```

Deploy to **Base Sepolia** first, then Base mainnet with `--rpc-url base`. Verification goes to Basescan through the Etherscan V2 API (`ETHERSCAN_API_KEY`):

```bash
DEPLOYER_PRIVATE_KEY=0x… ADMIN_ADDRESS=0x… SIGNER_ADDRESS=0x… \
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
```

`SIGNER_ADDRESS` is the address of `CLAIM_SIGNER_PRIVATE_KEY` used by the web app.
