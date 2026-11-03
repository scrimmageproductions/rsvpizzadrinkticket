// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {RsvpTickets} from "../src/RsvpTickets.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract RsvpTicketsTest is Test {
    RsvpTickets internal tickets;

    address internal admin = makeAddr("admin");
    uint256 internal signerPk = 0xA11CE;
    address internal signer = vm.addr(signerPk);

    address internal guest = makeAddr("guest-smart-account");
    address internal friend = makeAddr("friend-not-at-event");

    uint256 internal constant DRINK = 1;
    uint256 internal constant PIZZA = 2;
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    function setUp() public {
        tickets = new RsvpTickets("https://rsv.pizza/api/tickets/{id}.json", admin, signer);
        vm.warp(1_800_000_000);
    }

    // ───────────────────────── helpers

    function _signClaim(uint256 pk, address to, uint256 id, uint256 amount, bytes32 claimId, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(abi.encode(tickets.CLAIM_TYPEHASH(), to, id, amount, claimId, deadline));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, tickets.hashTypedData(structHash));
        return abi.encodePacked(r, s, v);
    }

    function _signBatch(
        uint256 pk,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes32 claimId,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                tickets.CLAIM_BATCH_TYPEHASH(),
                to,
                keccak256(abi.encodePacked(ids)),
                keccak256(abi.encodePacked(amounts)),
                claimId,
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, tickets.hashTypedData(structHash));
        return abi.encodePacked(r, s, v);
    }

    function _bundle() internal pure returns (uint256[] memory ids, uint256[] memory amounts) {
        ids = new uint256[](2);
        amounts = new uint256[](2);
        (ids[0], ids[1]) = (DRINK, PIZZA);
        (amounts[0], amounts[1]) = (2, 1);
    }

    function _claimBundle() internal {
        (uint256[] memory ids, uint256[] memory amounts) = _bundle();
        bytes32 claimId = keccak256("event-1:rsvp-1");
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _signBatch(signerPk, guest, ids, amounts, claimId, deadline);
        tickets.claimTicketsBatch(guest, ids, amounts, claimId, deadline, sig);
    }

    // ───────────────────────── claim

    function test_claimTickets_mintsWithValidVoucher() public {
        bytes32 claimId = keccak256("c1");
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signClaim(signerPk, guest, DRINK, 2, claimId, deadline);

        tickets.claimTickets(guest, DRINK, 2, claimId, deadline, sig);

        assertEq(tickets.balanceOf(guest, DRINK), 2);
        assertTrue(tickets.claimUsed(claimId));
    }

    function test_claimTicketsBatch_mintsBundle() public {
        _claimBundle();
        assertEq(tickets.balanceOf(guest, DRINK), 2);
        assertEq(tickets.balanceOf(guest, PIZZA), 1);
    }

    function test_claim_revertsOnReplay() public {
        _claimBundle();
        (uint256[] memory ids, uint256[] memory amounts) = _bundle();
        bytes32 claimId = keccak256("event-1:rsvp-1");
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _signBatch(signerPk, guest, ids, amounts, claimId, deadline);

        vm.expectRevert(abi.encodeWithSelector(RsvpTickets.VoucherAlreadyUsed.selector, claimId));
        tickets.claimTicketsBatch(guest, ids, amounts, claimId, deadline, sig);
    }

    function test_claim_reissuedVoucherForSameClaimIdCannotDoubleMint() public {
        bytes32 claimId = keccak256("c1");
        bytes memory sigA = _signClaim(signerPk, guest, DRINK, 2, claimId, block.timestamp + 600);
        bytes memory sigB = _signClaim(signerPk, guest, DRINK, 2, claimId, block.timestamp + 900);

        tickets.claimTickets(guest, DRINK, 2, claimId, block.timestamp + 600, sigA);
        vm.expectRevert(abi.encodeWithSelector(RsvpTickets.VoucherAlreadyUsed.selector, claimId));
        tickets.claimTickets(guest, DRINK, 2, claimId, block.timestamp + 900, sigB);
    }

    function test_claim_revertsWhenExpired() public {
        bytes32 claimId = keccak256("c1");
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signClaim(signerPk, guest, DRINK, 2, claimId, deadline);

        vm.warp(deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(RsvpTickets.VoucherExpired.selector, deadline));
        tickets.claimTickets(guest, DRINK, 2, claimId, deadline, sig);
    }

    function test_claim_revertsForUnauthorisedSigner() public {
        bytes32 claimId = keccak256("c1");
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signClaim(0xBAD, guest, DRINK, 2, claimId, deadline);

        vm.expectRevert(RsvpTickets.InvalidSignature.selector);
        tickets.claimTickets(guest, DRINK, 2, claimId, deadline, sig);
    }

    function test_claim_cannotRedirectVoucherToAnotherWallet() public {
        bytes32 claimId = keccak256("c1");
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signClaim(signerPk, guest, DRINK, 2, claimId, deadline);

        vm.expectRevert(RsvpTickets.InvalidSignature.selector);
        tickets.claimTickets(friend, DRINK, 2, claimId, deadline, sig);
    }

    function test_claim_cannotInflateAmount() public {
        bytes32 claimId = keccak256("c1");
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signClaim(signerPk, guest, DRINK, 2, claimId, deadline);

        vm.expectRevert(RsvpTickets.InvalidSignature.selector);
        tickets.claimTickets(guest, DRINK, 20, claimId, deadline, sig);
    }

    function test_claim_rejectsMalformedSignature() public {
        vm.expectRevert(RsvpTickets.InvalidSignature.selector);
        tickets.claimTickets(guest, DRINK, 2, keccak256("c1"), block.timestamp + 600, hex"1234");
    }

    function test_signerRotation() public {
        uint256 newPk = 0xB0B;
        bytes32 signerRole = tickets.SIGNER_ROLE();
        vm.startPrank(admin);
        tickets.revokeRole(signerRole, signer);
        tickets.grantRole(signerRole, vm.addr(newPk));
        vm.stopPrank();

        uint256 deadline = block.timestamp + 600;
        bytes memory oldSig = _signClaim(signerPk, guest, DRINK, 1, keccak256("a"), deadline);
        vm.expectRevert(RsvpTickets.InvalidSignature.selector);
        tickets.claimTickets(guest, DRINK, 1, keccak256("a"), deadline, oldSig);

        bytes memory newSig = _signClaim(newPk, guest, DRINK, 1, keccak256("a"), deadline);
        tickets.claimTickets(guest, DRINK, 1, keccak256("a"), deadline, newSig);
        assertEq(tickets.balanceOf(guest, DRINK), 1);
    }

    // ───────────────────────── redeem

    function test_redeemTicket_sendsToDeadAddress() public {
        _claimBundle();

        vm.prank(guest);
        tickets.redeemTicket(guest, DRINK, 1);

        assertEq(tickets.balanceOf(guest, DRINK), 1);
        assertEq(tickets.balanceOf(DEAD, DRINK), 1);
    }

    function test_redeemTicket_onlyHolderCanRedeem() public {
        _claimBundle();

        vm.prank(friend);
        vm.expectRevert(abi.encodeWithSelector(RsvpTickets.NotTokenOwner.selector, friend, guest));
        tickets.redeemTicket(guest, DRINK, 1);
    }

    function test_redeemTicket_revertsWithoutBalance() public {
        _claimBundle();
        vm.startPrank(guest);
        tickets.redeemTicket(guest, PIZZA, 1);
        vm.expectRevert(); // ERC1155InsufficientBalance
        tickets.redeemTicket(guest, PIZZA, 1);
        vm.stopPrank();
    }

    function test_redeemTicket_revertsOnZero() public {
        _claimBundle();
        vm.prank(guest);
        vm.expectRevert(RsvpTickets.ZeroAmount.selector);
        tickets.redeemTicket(guest, DRINK, 0);
    }

    // ───────────────────────── soulbound

    function test_soulbound_safeTransferFromReverts() public {
        _claimBundle();
        vm.prank(guest);
        vm.expectRevert(RsvpTickets.Soulbound.selector);
        tickets.safeTransferFrom(guest, friend, DRINK, 1, "");
    }

    function test_soulbound_safeBatchTransferFromReverts() public {
        _claimBundle();
        (uint256[] memory ids, uint256[] memory amounts) = _bundle();
        vm.prank(guest);
        vm.expectRevert(RsvpTickets.Soulbound.selector);
        tickets.safeBatchTransferFrom(guest, friend, ids, amounts, "");
    }

    function test_soulbound_approvalsDisabled() public {
        vm.prank(guest);
        vm.expectRevert(RsvpTickets.ApprovalsDisabled.selector);
        tickets.setApprovalForAll(friend, true);
    }

    function testFuzz_soulbound_noTransferToAnyoneButDead(address to) public {
        vm.assume(to != address(0) && to != DEAD && to != guest);
        _claimBundle();
        vm.prank(guest);
        vm.expectRevert(RsvpTickets.Soulbound.selector);
        tickets.safeTransferFrom(guest, to, DRINK, 1, "");
    }

    // ───────────────────────── admin

    function test_pause_blocksClaimAndRedeem() public {
        _claimBundle();
        vm.prank(admin);
        tickets.pause();

        vm.prank(guest);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        tickets.redeemTicket(guest, DRINK, 1);
    }

    function test_onlyOperatorCanPause() public {
        bytes32 role = tickets.OPERATOR_ROLE();
        vm.prank(friend);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, friend, role)
        );
        tickets.pause();
    }

    // ───────────────────────── admin override

    function test_adminRedeem_burnsWithoutGuestDevice() public {
        _claimBundle();
        vm.prank(admin);
        tickets.adminRedeem(guest, DRINK, 1);
        assertEq(tickets.balanceOf(guest, DRINK), 1);
        assertEq(tickets.balanceOf(DEAD, DRINK), 1);
    }

    function test_adminRedeem_onlyAdminRole() public {
        _claimBundle();
        bytes32 role = tickets.ADMIN_ROLE();
        vm.prank(friend);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, friend, role));
        tickets.adminRedeem(guest, DRINK, 1);
    }

    function test_adminRedeem_cannotOverdraw() public {
        _claimBundle();
        vm.prank(admin);
        vm.expectRevert(); // ERC1155InsufficientBalance
        tickets.adminRedeem(guest, PIZZA, 2);
    }

    function test_adminTransfer_wingman() public {
        _claimBundle();
        vm.prank(admin);
        tickets.adminTransfer(guest, friend, DRINK, 2);
        assertEq(tickets.balanceOf(guest, DRINK), 0);
        assertEq(tickets.balanceOf(friend, DRINK), 2);
    }

    function test_adminTransfer_onlyAdminRole() public {
        _claimBundle();
        bytes32 role = tickets.ADMIN_ROLE();
        vm.prank(guest);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, guest, role));
        tickets.adminTransfer(guest, friend, DRINK, 1);
    }

    function test_adminTransfer_rejectsBadRecipient() public {
        _claimBundle();
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(RsvpTickets.InvalidRecipient.selector, DEAD));
        tickets.adminTransfer(guest, DEAD, DRINK, 1);
        vm.expectRevert(abi.encodeWithSelector(RsvpTickets.InvalidRecipient.selector, guest));
        tickets.adminTransfer(guest, guest, DRINK, 1);
        vm.stopPrank();
    }

    function test_adminTransfer_overrideDoesNotLeak() public {
        _claimBundle();
        vm.prank(admin);
        tickets.adminTransfer(guest, friend, DRINK, 1);
        // Same transaction context is over; soulbound is back in force for the recipient.
        vm.prank(friend);
        vm.expectRevert(RsvpTickets.Soulbound.selector);
        tickets.safeTransferFrom(friend, guest, DRINK, 1, "");
    }

    function test_adminRole_revocable() public {
        bytes32 role = tickets.ADMIN_ROLE();
        address hostServer = makeAddr("host-server-smart-account");
        vm.startPrank(admin);
        tickets.grantRole(role, hostServer);
        tickets.revokeRole(role, hostServer);
        vm.stopPrank();
        _claimBundle();
        vm.prank(hostServer);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, hostServer, role));
        tickets.adminRedeem(guest, DRINK, 1);
    }

    function test_adminActions_blockedWhenPaused() public {
        _claimBundle();
        vm.startPrank(admin);
        tickets.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        tickets.adminTransfer(guest, friend, DRINK, 1);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        tickets.adminRedeem(guest, DRINK, 1);
        vm.stopPrank();
    }

    // ───────────────────────── admin mint ("Make It Right")

    function test_adminMint_grantsExtraTickets() public {
        _claimBundle();
        vm.prank(admin);
        tickets.adminMint(guest, DRINK, 3);
        assertEq(tickets.balanceOf(guest, DRINK), 5);
    }

    function test_adminMint_worksWithoutPriorClaimAndNewTokenId() public {
        uint256 MERCH = 7;
        vm.prank(admin);
        tickets.adminMint(friend, MERCH, 1);
        assertEq(tickets.balanceOf(friend, MERCH), 1);
    }

    function test_adminMint_onlyAdminRole() public {
        bytes32 role = tickets.ADMIN_ROLE();
        vm.prank(guest);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, guest, role));
        tickets.adminMint(guest, DRINK, 1);
    }

    function test_adminMint_rejectsZeroAndBadRecipient() public {
        vm.startPrank(admin);
        vm.expectRevert(RsvpTickets.ZeroAmount.selector);
        tickets.adminMint(guest, DRINK, 0);
        vm.expectRevert(abi.encodeWithSelector(RsvpTickets.InvalidRecipient.selector, DEAD));
        tickets.adminMint(DEAD, DRINK, 1);
        vm.expectRevert(abi.encodeWithSelector(RsvpTickets.InvalidRecipient.selector, address(0)));
        tickets.adminMint(address(0), DRINK, 1);
        vm.stopPrank();
    }

    function test_adminMint_blockedWhenPaused() public {
        vm.startPrank(admin);
        tickets.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        tickets.adminMint(guest, DRINK, 1);
        vm.stopPrank();
    }

    function test_adminMint_grantedTicketsAreStillSoulbound() public {
        vm.prank(admin);
        tickets.adminMint(guest, DRINK, 1);
        vm.prank(guest);
        vm.expectRevert(RsvpTickets.Soulbound.selector);
        tickets.safeTransferFrom(guest, friend, DRINK, 1, "");
        vm.prank(guest);
        tickets.redeemTicket(guest, DRINK, 1);
        assertEq(tickets.balanceOf(DEAD, DRINK), 1);
    }

    // ───────────────────────── chain binding (Base migration)

    /// The EIP-712 domain is derived from block.chainid, so a voucher is only valid on the chain it
    /// was signed for — e.g. an old Avalanche voucher can never be replayed on Base, and a Base
    /// Sepolia voucher never on Base mainnet. Also covers OZ's cached-separator recompute path.
    function test_voucher_boundToChainId_base() public {
        uint256 BASE = 8453;
        uint256 BASE_SEPOLIA = 84532;
        uint256 AVALANCHE = 43114;
        bytes32 claimId = keccak256("chain-bound");

        // signed while the chain says Avalanche
        vm.chainId(AVALANCHE);
        uint256 deadline = block.timestamp + 600;
        bytes memory avaxSig = _signClaim(signerPk, guest, DRINK, 1, claimId, deadline);
        vm.chainId(BASE_SEPOLIA);
        bytes memory sepoliaSig = _signClaim(signerPk, guest, DRINK, 1, claimId, deadline);

        // now on Base mainnet: both foreign vouchers fail…
        vm.chainId(BASE);
        vm.expectRevert(RsvpTickets.InvalidSignature.selector);
        tickets.claimTickets(guest, DRINK, 1, claimId, deadline, avaxSig);
        vm.expectRevert(RsvpTickets.InvalidSignature.selector);
        tickets.claimTickets(guest, DRINK, 1, claimId, deadline, sepoliaSig);

        // …and a voucher signed for Base works.
        bytes memory baseSig = _signClaim(signerPk, guest, DRINK, 1, claimId, deadline);
        tickets.claimTickets(guest, DRINK, 1, claimId, deadline, baseSig);
        assertEq(tickets.balanceOf(guest, DRINK), 1);

        (, , , uint256 domainChainId, , , ) = tickets.eip712Domain();
        assertEq(domainChainId, BASE);
    }
}
