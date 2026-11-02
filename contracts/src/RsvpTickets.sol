// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title  RsvpTickets — soulbound, signature-gated ERC-1155 event perks for rsv.pizza
/// @notice Each token id is a perk type for an event (e.g. id 1 = "Free Drink", id 2 = "Pizza Slice").
///
///         Minting is gated by an EIP-712 voucher signed by the rsv.pizza backend. The backend only
///         signs after it has verified, off-chain, that (a) door staff checked the guest in and
///         (b) the guest typed the Event PIN that is physically posted inside the venue.
///         ("Dual-Layer Gated Minting".)
///
///         Tokens are soulbound: they can be minted, and they can be redeemed (sent to 0x…dEaD),
///         but they can never be moved between wallets, so guests cannot forward drinks to friends
///         who are not at the event.
///
///         Redemption is called by the guest's own ERC-4337 smart account, so a Paymaster can
///         sponsor the gas and the whole flow is gasless for the guest.
contract RsvpTickets is ERC1155, AccessControl, Pausable, EIP712 {
    // ───────────────────────────────────────────── constants

    /// @notice Address redeemed tokens are sent to. Balances here are a public, auditable
    ///         "drinks poured" counter per token id.
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Role allowed to sign claim vouchers (the rsv.pizza backend signer key).
    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");

    /// @notice Role allowed to pause and to update metadata.
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(address to,uint256 id,uint256 amount,bytes32 claimId,uint256 deadline)");

    bytes32 public constant CLAIM_BATCH_TYPEHASH =
        keccak256("ClaimBatch(address to,uint256[] ids,uint256[] amounts,bytes32 claimId,uint256 deadline)");

    // ───────────────────────────────────────────── storage

    /// @notice claimId => already used. A claimId is derived by the backend from (eventId, rsvpId),
    ///         so each RSVP can mint exactly once no matter how many times a voucher is re-issued.
    mapping(bytes32 claimId => bool used) public claimUsed;

    // ───────────────────────────────────────────── events / errors

    event TicketsClaimed(address indexed to, bytes32 indexed claimId, uint256[] ids, uint256[] amounts);
    event TicketRedeemed(address indexed account, uint256 indexed id, uint256 amount);

    error Soulbound();
    error ApprovalsDisabled();
    error VoucherExpired(uint256 deadline);
    error VoucherAlreadyUsed(bytes32 claimId);
    error InvalidSignature();
    error NotTokenOwner(address caller, address account);
    error ZeroAmount();

    // ───────────────────────────────────────────── constructor

    constructor(string memory uri_, address admin, address signer)
        ERC1155(uri_)
        EIP712("RsvPizzaTickets", "1")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(SIGNER_ROLE, signer);
    }

    // ───────────────────────────────────────────── claim (gated mint)

    /// @notice Mint `amount` of perk `id` to `to`, authorised by a backend-signed voucher.
    /// @dev    Anyone may submit the transaction (e.g. the guest's smart account, or a relayer);
    ///         the voucher pins the recipient so it cannot be redirected.
    /// @param  claimId  Unique id for this entitlement; burned on use to prevent replay.
    /// @param  deadline Unix timestamp after which the voucher is void (short-lived, ~10 min).
    function claimTickets(
        address to,
        uint256 id,
        uint256 amount,
        bytes32 claimId,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused {
        bytes32 structHash = keccak256(abi.encode(CLAIM_TYPEHASH, to, id, amount, claimId, deadline));
        _consumeVoucher(structHash, claimId, deadline, signature);

        uint256[] memory ids = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);
        ids[0] = id;
        amounts[0] = amount;

        _mint(to, id, amount, "");
        emit TicketsClaimed(to, claimId, ids, amounts);
    }

    /// @notice Batch variant: one voucher mints a guest's whole perk bundle
    ///         (e.g. 2x Free Drink + 1x Pizza Slice) in a single gasless UserOperation.
    function claimTicketsBatch(
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes32 claimId,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused {
        bytes32 structHash = keccak256(
            abi.encode(
                CLAIM_BATCH_TYPEHASH,
                to,
                keccak256(abi.encodePacked(ids)),
                keccak256(abi.encodePacked(amounts)),
                claimId,
                deadline
            )
        );
        _consumeVoucher(structHash, claimId, deadline, signature);

        _mintBatch(to, ids, amounts, "");
        emit TicketsClaimed(to, claimId, ids, amounts);
    }

    // ───────────────────────────────────────────── redeem (gasless burn)

    /// @notice Redeem perks: moves `amount` of `id` from `account` to the 0x…dEaD burn address.
    /// @dev    Must be called by the holder itself — in practice the guest's ERC-4337 smart account
    ///         executing a Paymaster-sponsored UserOperation. Approvals are disabled, so no third
    ///         party can ever redeem on a guest's behalf.
    function redeemTicket(address account, uint256 id, uint256 amount) external whenNotPaused {
        if (msg.sender != account) revert NotTokenOwner(msg.sender, account);
        if (amount == 0) revert ZeroAmount();

        uint256[] memory ids = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);
        ids[0] = id;
        amounts[0] = amount;

        // `_update` (not `_safeTransferFrom`) so no receiver hook runs — 0x…dEaD has no code anyway.
        _update(account, BURN_ADDRESS, ids, amounts);
        emit TicketRedeemed(account, id, amount);
    }

    // ───────────────────────────────────────────── soulbound enforcement

    /// @dev Single choke point for every balance change in OZ ERC-1155.
    ///      Allowed: mint (from == 0), burn (to == 0), redeem (to == BURN_ADDRESS).
    ///      Everything else — i.e. wallet-to-wallet transfers — reverts.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override
    {
        if (from != address(0) && to != address(0) && to != BURN_ADDRESS) revert Soulbound();
        super._update(from, to, ids, values);
    }

    /// @dev No operators: nobody but the holder can ever move (redeem) its tickets.
    function setApprovalForAll(address, bool) public pure override {
        revert ApprovalsDisabled();
    }

    // ───────────────────────────────────────────── admin

    function setURI(string calldata newUri) external onlyRole(OPERATOR_ROLE) {
        _setURI(newUri);
    }

    function pause() external onlyRole(OPERATOR_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(OPERATOR_ROLE) {
        _unpause();
    }

    /// @notice Exposed so off-chain code / tests can reproduce the exact digest that gets signed.
    function hashTypedData(bytes32 structHash) external view returns (bytes32) {
        return _hashTypedDataV4(structHash);
    }

    // ───────────────────────────────────────────── internals

    function _consumeVoucher(bytes32 structHash, bytes32 claimId, uint256 deadline, bytes calldata signature)
        private
    {
        if (block.timestamp > deadline) revert VoucherExpired(deadline);
        if (claimUsed[claimId]) revert VoucherAlreadyUsed(claimId);

        // ECDSA.tryRecover rejects malformed and malleable (high-s) signatures.
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(_hashTypedDataV4(structHash), signature);
        if (err != ECDSA.RecoverError.NoError || !hasRole(SIGNER_ROLE, signer)) revert InvalidSignature();

        claimUsed[claimId] = true;
    }

    // ───────────────────────────────────────────── ERC-165

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
