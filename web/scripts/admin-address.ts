/** Prints the host override smart-account address to grant ADMIN_ROLE to. Needs ADMIN_PRIVATE_KEY + NEXT_PUBLIC_CHAIN. */
import { createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { chain, rpcUrl } from "../src/lib/chain";

const pk = process.env.ADMIN_PRIVATE_KEY as Hex | undefined;
if (!pk) throw new Error("set ADMIN_PRIVATE_KEY");
const account = await toSimpleSmartAccount({
  client: createPublicClient({ chain, transport: http(rpcUrl) }),
  owner: privateKeyToAccount(pk),
  entryPoint: { address: entryPoint07Address, version: "0.7" },
});
console.log(`ADMIN_ROLE grantee (smart account): ${account.address}`);
console.log(`cast send $TICKETS "grantRole(bytes32,address)" $(cast keccak ADMIN_ROLE) ${account.address} --rpc-url fuji`);
