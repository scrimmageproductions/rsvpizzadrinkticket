// Regenerates src/lib/abi.ts from the Foundry artifact. Run `forge build` in ../contracts first.
import { readFileSync, writeFileSync } from "node:fs";

const KEEP = new Set([
  "claimTickets", "claimTicketsBatch", "redeemTicket", "balanceOf", "balanceOfBatch", "claimUsed",
  "TicketsClaimed", "TicketRedeemed", "Soulbound", "ApprovalsDisabled", "VoucherExpired",
  "VoucherAlreadyUsed", "InvalidSignature", "NotTokenOwner", "ZeroAmount",
  "ERC1155InsufficientBalance", "EnforcedPause",
]);
const artifact = JSON.parse(
  readFileSync(new URL("../../contracts/out/RsvpTickets.sol/RsvpTickets.json", import.meta.url), "utf8"),
);
const abi = artifact.abi.filter((x) => KEEP.has(x.name));
writeFileSync(
  new URL("../src/lib/abi.ts", import.meta.url),
  "// Generated from contracts/out/RsvpTickets.sol/RsvpTickets.json (subset used by the app).\n" +
    "// Regenerate: `npm run abi` after `forge build`.\n" +
    `export const rsvpTicketsAbi = ${JSON.stringify(abi, null, 2)} as const;\n`,
);
console.log(`wrote ${abi.length} ABI entries`);
