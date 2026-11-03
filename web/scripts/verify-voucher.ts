/**
 * End-to-end check that the backend's EIP-712 voucher (src/lib/server/signer.ts) is accepted by
 * RsvpTickets.claimTicketsBatch on a BASE-configured chain, and that soulbound, redeem-to-dEaD and
 * the ADMIN_ROLE overrides (incl. transient-storage adminTransfer) behave as expected.
 *
 *   anvil --chain-id 84532 --optimism &         # local OP-stack node posing as Base Sepolia
 *   npm run verify:voucher                      # VERIFY_CHAIN=base + --chain-id 8453 for mainnet id
 */
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalanche, base, baseSepolia } from "viem/chains";
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

// Base's chain id + metadata, but pointed at the local anvil node.
const target = process.env.VERIFY_CHAIN === "base" ? base : baseSepolia;
const localBase = defineChain({ ...target, rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } } });

async function main() {
  const admin = privateKeyToAccount(ADMIN_PK);
  const signer = privateKeyToAccount(SIGNER_PK);
  const pub = createPublicClient({ chain: localBase, transport: http() });
  const wallet = createWalletClient({ chain: localBase, transport: http(), account: admin });

  const nodeChainId = await pub.getChainId();
  if (nodeChainId !== target.id) {
    throw new Error(`anvil is on chain ${nodeChainId}; start it with --chain-id ${target.id} to pose as ${target.name}`);
  }
  console.log(`node: ${target.name} (chain ${nodeChainId})`);

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
  // EIP-712 domain: the contract derives it from block.chainid; confirm it reports Base's id.
  const [, domainName, domainVersion, domainChainId, domainContract] = await pub.readContract({
    address: tickets,
    abi: parseAbi(["function eip712Domain() view returns (bytes1, string, string, uint256, address, bytes32, uint256[])"]),
    functionName: "eip712Domain",
  });
  console.log(`EIP-712 domain: ${domainName} v${domainVersion}, chainId ${domainChainId}, ${domainContract}`);
  if (domainChainId !== BigInt(target.id)) throw new Error("EIP-712 domain chainId does not match Base");

  // Cross-chain replay protection: vouchers signed for another chain must be rejected here.
  for (const other of [avalanche, target.id === base.id ? baseSepolia : base]) {
    const foreign = await signClaimBatch({
      to: guest, ids, amounts, claimId, deadline, chainId: other.id, verifyingContract: tickets,
    });
    try {
      await pub.simulateContract({
        account: admin, address: tickets, abi: rsvpTicketsAbi, functionName: "claimTicketsBatch",
        args: [guest, ids, amounts, claimId, deadline, foreign],
      });
      throw new Error(`voucher signed for ${other.name} was accepted`);
    } catch (e) {
      if ((e as Error).message.includes("was accepted")) throw e;
      console.log(`voucher signed for ${other.name} (${other.id}) rejected ✓`);
    }
  }

  const signature = await signClaimBatch({
    to: guest, ids, amounts, claimId, deadline, chainId: target.id, verifyingContract: tickets,
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

  // ADMIN_ROLE overrides — adminTransfer relies on transient storage (TSTORE, Cancun / Base Ecotone).
  const friend = signer.address;
  const send = async (functionName: "adminMint" | "adminTransfer" | "adminRedeem", args: readonly unknown[]) =>
    pub.waitForTransactionReceipt({
      hash: await wallet.writeContract({ address: tickets, abi: rsvpTicketsAbi, functionName, args } as never),
    });
  await send("adminMint", [guest, 7n, 2n]);
  await send("adminTransfer", [guest, friend, 7n, 1n]);
  await send("adminRedeem", [friend, 7n, 1n]);
  const [g7, f7, d7] = await pub.readContract({
    address: tickets, abi: rsvpTicketsAbi, functionName: "balanceOfBatch", args: [[guest, friend, "0x000000000000000000000000000000000000dEaD"], [7n, 7n, 7n]],
  });
  console.log(`adminMint 2 → adminTransfer 1 → adminRedeem 1: guest ${g7}, friend ${f7}, dEaD ${d7}`);
  if (g7 !== 1n || f7 !== 0n || d7 !== 1n) throw new Error("admin override flow failed");
  // …and the transient override must not leak: the friend still can't transfer by themselves.
  try {
    await pub.simulateContract({
      account: guest, address: tickets,
      abi: parseAbi(["function safeTransferFrom(address,address,uint256,uint256,bytes)"]),
      functionName: "safeTransferFrom", args: [guest, friend, 7n, 1n, "0x"],
    });
    throw new Error("soulbound leaked after adminTransfer");
  } catch (e) {
    if ((e as Error).message.includes("leaked")) throw e;
    console.log("soulbound still enforced after adminTransfer ✓");
  }
  console.log(`\nAll voucher / soulbound / redeem / admin checks passed on ${target.name} (${target.id}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
