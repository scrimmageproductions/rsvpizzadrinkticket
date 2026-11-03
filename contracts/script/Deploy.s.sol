// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {RsvpTickets} from "../src/RsvpTickets.sol";

/// Base Sepolia (testnet):  forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
/// Base mainnet:            forge script script/Deploy.s.sol --rpc-url base --broadcast --verify
/// (rpc + Basescan endpoints are defined in foundry.toml; verification needs ETHERSCAN_API_KEY)
///
/// Nothing in the contract is chain-specific: the EIP-712 domain uses block.chainid (8453 / 84532),
/// which must match NEXT_PUBLIC_CHAIN in the web app, or every claim voucher will be rejected.
/// Base supports Cancun opcodes, incl. the transient storage (TSTORE) used by adminTransfer.
/// Env: DEPLOYER_PRIVATE_KEY, ADMIN_ADDRESS, SIGNER_ADDRESS, TOKEN_URI (optional),
///      HOST_ADMIN_ADDRESS (optional: the web app's admin smart account, gets ADMIN_ROLE).
///      Note: ADMIN_ROLE is only granted here if ADMIN_ADDRESS is the deployer; otherwise the admin
///      grants it later with `cast send <tickets> "grantRole(bytes32,address)" $(cast keccak ADMIN_ROLE) <addr>`.
contract Deploy is Script {
    function run() external returns (RsvpTickets tickets) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address signer = vm.envAddress("SIGNER_ADDRESS");
        string memory uri = vm.envOr("TOKEN_URI", string("https://rsv.pizza/api/tickets/{id}.json"));

        vm.startBroadcast(deployerKey);
        tickets = new RsvpTickets(uri, admin, signer);
        address hostAdmin = vm.envOr("HOST_ADMIN_ADDRESS", address(0));
        if (hostAdmin != address(0) && admin == vm.addr(deployerKey)) {
            tickets.grantRole(tickets.ADMIN_ROLE(), hostAdmin);
        }
        vm.stopBroadcast();

        console2.log("RsvpTickets deployed at", address(tickets));
    }
}
