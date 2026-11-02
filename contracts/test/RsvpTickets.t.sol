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
}
