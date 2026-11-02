/**
 * End-to-end check that the backend's EIP-712 voucher (src/lib/server/signer.ts) is accepted by
 * RsvpTickets.claimTicketsBatch, and that soulbound + redeem-to-dEaD behave as expected.
 *
 *   anvil &                                    # local chain on :8545
 *   npm run verify:voucher
 */
import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { readFileSync } from "node:fs";
import { claimIdFor, signClaimBatch } from "../src/lib/server/signer";
import { rsvpTicketsAbi } from "../src/lib/abi";

// anvil default keys #0 (deployer/admin, also plays the guest's "smart account") and #1 (signer)
const ADMIN_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const SIGNER_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f8603b6b78690d" as Hex;
process.env.CLAIM_SIGNER_PRIVATE_KEY = SIGNER_PK;

const artifact = JSON.parse(
  readFileSync(new URL("../../contracts/out/RsvpTickets.sol/RsvpTickets.json", import.meta.url), "utf8"),
);

async function main() {
  const admin = privateKeyToAccount(ADMIN_PK);
  const signer = privateKeyToAccount(SIGNER_PK);
  const pub = createPublicClient({ chain: foundry, transport: http() });
  const wallet = createWalletClient({ chain: foundry, transport: http(), account: admin });

  const deployHash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: ["https://rsv.pizza/api/tickets/{id}.json", admin.address, signer.address],
  });
  const { contractAddress } = await pub.waitForTransactionReceipt({ hash: deployHash });
  const tickets = contractAddress!;
  console.log("deployed", tickets);

  const guest = admin.address; // stand-in for the guest's smart account
  const ids = [1n, 2n];
  const amounts = [2n, 1n];
  const claimId = claimIdFor("pizza-night-nyc", "00000000-0000-0000-0000-000000000001");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const signature = await signClaimBatch({
    to: guest, ids, amounts, claimId, deadline, chainId: foundry.id, verifyingContract: tickets,
  });

  const claim = await wallet.writeContract({
    address: tickets, abi: rsvpTicketsAbi, functionName: "claimTicketsBatch",
    args: [guest, ids, amounts, claimId, deadline, signature],
  });
  await pub.waitForTransactionReceipt({ hash: claim });

  const bal = await pub.readContract({
    address: tickets, abi: rsvpTicketsAbi, functionName: "balanceOfBatch", args: [[guest, guest], ids],
  });
  console.log("balances after claim", bal);
  if (bal[0] !== 2n || bal[1] !== 1n) throw new Error("claim failed");

  // Replay must fail
  try {
    await pub.simulateContract({
      account: admin, address: tickets, abi: rsvpTicketsAbi, functionName: "claimTicketsBatch",
      args: [guest, ids, amounts, claimId, deadline, signature],
    });
    throw new Error("replay should revert");
  } catch (e) {
    if ((e as Error).message === "replay should revert") throw e;
    console.log("replay rejected ✓");
  }

  // Soulbound: transfer to a friend must fail
  try {
    await pub.simulateContract({
      account: admin, address: tickets,
      abi: parseAbi(["function safeTransferFrom(address,address,uint256,uint256,bytes)"]),
      functionName: "safeTransferFrom", args: [guest, signer.address, 1n, 1n, "0x"],
    });
    throw new Error("transfer should revert");
  } catch (e) {
    if ((e as Error).message === "transfer should revert") throw e;
    console.log("transfer blocked ✓");
  }

  const redeem = await wallet.writeContract({
    address: tickets, abi: rsvpTicketsAbi, functionName: "redeemTicket", args: [guest, 1n, 1n],
  });
  await pub.waitForTransactionReceipt({ hash: redeem });
  const dead = await pub.readContract({
    address: tickets, abi: rsvpTicketsAbi, functionName: "balanceOf",
    args: ["0x000000000000000000000000000000000000dEaD", 1n],
  });
  console.log("0x…dEaD drink balance", dead);
  if (dead !== 1n) throw new Error("redeem failed");
  console.log("\nAll voucher / soulbound / redeem checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
