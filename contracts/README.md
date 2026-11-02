# RsvpTickets — contracts

Soulbound, signature-gated ERC-1155 perks (drinks, pizza slices) for rsv.pizza events.

| Function | Who calls it | What it does |
|---|---|---|
| `claimTickets(to, id, amount, claimId, deadline, sig)` | guest smart account (gasless) | Mints one perk type if `sig` is a valid EIP-712 `Claim` voucher from a `SIGNER_ROLE` key |
| `claimTicketsBatch(to, ids[], amounts[], claimId, deadline, sig)` | guest smart account (gasless) | Same, for the whole bundle (2× drink + 1× pizza) in one UserOperation — what the app uses |
| `redeemTicket(account, id, amount)` | the holder only (`msg.sender == account`) | Moves the perk to `0x…dEaD` |
| `pause / unpause / setURI` | `OPERATOR_ROLE` | Emergency stop, metadata |
| `grantRole / revokeRole(SIGNER_ROLE, …)` | `DEFAULT_ADMIN_ROLE` | Rotate the backend signer |

**Soulbound:** `_update` reverts unless it is a mint (`from == 0`), a burn (`to == 0`) or a redemption (`to == 0x…dEaD`). `setApprovalForAll` always reverts, so nobody but the holder can ever move a ticket.

**Replay protection:** every voucher carries a `claimId` (backend derives it from `eventId + rsvpId`) that is marked used on first mint, plus a short `deadline`. The backend can safely re-issue a voucher for the same RSVP (e.g. after a failed UserOp) — only one can ever execute.

## Commands

```bash
forge build
forge test -vv
```

Deploy to Fuji (then mainnet with `--rpc-url avalanche`):

```bash
DEPLOYER_PRIVATE_KEY=0x… ADMIN_ADDRESS=0x… SIGNER_ADDRESS=0x… \
forge script script/Deploy.s.sol --rpc-url fuji --broadcast --verify
```

`SIGNER_ADDRESS` is the address of `CLAIM_SIGNER_PRIVATE_KEY` used by the web app.
