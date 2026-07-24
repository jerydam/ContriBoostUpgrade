// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "../lib/openzeppelin-contracts/contracts/security/ReentrancyGuard.sol";
import "../lib/openzeppelin-contracts/contracts/security/Pausable.sol";
import "../lib/openzeppelin-contracts/contracts/access/AccessControl.sol";

/// @title BillPayment
/// @notice Escrow-style gateway for paying bills (airtime, data, electricity, TV, etc.)
///         with an ERC20 token. The bill itself (the actual airtime top-up, electricity
///         token, TV subscription, ...) is purchased off-chain through a third-party
///         provider API. This contract only handles the on-chain payment leg and gates
///         the release of funds to the merchant treasury on confirmation that the
///         off-chain purchase succeeded.
///
/// Flow:
/// 1. Backend generates a unique `billId` for a price quote and stores
///    (billId => expected token/amount/category/externalRef) off-chain.
/// 2. User calls `payBill` on-chain, which escrows the token in this contract
///    and emits `BillPaid`.
/// 3. Backend's indexer picks up `BillPaid`, cross-checks the on-chain amount/token/
///    category/externalRef against its stored quote for that billId, then calls the
///    off-chain provider API to actually fulfill the bill.
/// 4. On provider success, backend (holding FULFILLER_ROLE) calls `fulfillBill`,
///    which releases the escrowed funds to `treasury`.
///    On provider failure, backend calls `failBill`, which refunds the payer automatically.
/// 5. If the backend never responds (downtime, crash), the payer can self-serve a
///    refund via `claimTimeoutRefund` once `refundTimeout` has elapsed.
///
/// Off-chain integration requirement: step 3's cross-check is mandatory. The backend
/// must never fulfill a bill based on `billId` alone — it must verify the emitted
/// `amount`/`token`/`category`/`externalRef` match what it quoted before calling the
/// provider, otherwise a user could pay less than quoted and still receive service.
contract BillPayment is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant FULFILLER_ROLE = keccak256("FULFILLER_ROLE");

    enum Category {
        Airtime,
        Data,
        Electricity,
        TV,
        Other
    }

    enum Status {
        None,
        Paid,
        Fulfilled,
        Failed,
        Refunded
    }

    struct Bill {
        address payer;
        address token;
        uint256 amount;
        Category category;
        Status status;
        uint64 paidAt;
        bytes32 externalRef; // opaque off-chain reference (e.g. hash of phone/meter/smartcard) — no PII stored on-chain
    }

    mapping(bytes32 => Bill) public bills;
    mapping(address => bool) public supportedTokens;
    mapping(address => uint256) public totalEscrowed;

    address public treasury;
    uint256 public refundTimeout = 24 hours;

    event TokenSupportUpdated(address indexed token, bool supported);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event RefundTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout);
    event BillPaid(
        bytes32 indexed billId,
        address indexed payer,
        address indexed token,
        uint256 amount,
        Category category,
        bytes32 externalRef
    );
    event BillFulfilled(bytes32 indexed billId);
    event BillFailed(bytes32 indexed billId, string reason);
    event BillRefunded(bytes32 indexed billId, address indexed payer, uint256 amount);
    event ExcessRecovered(address indexed token, address indexed to, uint256 amount);

    constructor(address _admin, address _treasury) {
        require(_admin != address(0), "Invalid admin address");
        require(_treasury != address(0), "Invalid treasury address");

        treasury = _treasury;
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(FULFILLER_ROLE, _admin);
    }

    function setSupportedToken(address token, bool supported) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(token != address(0), "Invalid token address");
        supportedTokens[token] = supported;
        emit TokenSupportUpdated(token, supported);
    }

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Invalid treasury address");
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }

    function setRefundTimeout(uint256 _timeout) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_timeout >= 1 hours && _timeout <= 7 days, "Timeout out of range");
        emit RefundTimeoutUpdated(refundTimeout, _timeout);
        refundTimeout = _timeout;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Pay for a bill. Escrows `amount` of `token` in this contract until
    ///         the off-chain fulfiller confirms success or failure (or the payer
    ///         claims a timeout refund).
    /// @param billId Unique id chosen by the backend for this bill quote. Must not
    ///        have been used before.
    /// @param token ERC20 token to pay with; must be on the supported list.
    /// @param amount Exact token amount to escrow (as quoted by the backend).
    /// @param category Bill category, for indexing/analytics.
    /// @param externalRef Opaque reference the backend uses to map this payment to
    ///        the actual off-chain bill details (phone number, meter number, ...).
    ///        Store only a hash/id here, never raw personal data.
    function payBill(
        bytes32 billId,
        address token,
        uint256 amount,
        Category category,
        bytes32 externalRef
    ) external nonReentrant whenNotPaused {
        require(billId != bytes32(0), "Invalid billId");
        require(bills[billId].payer == address(0), "billId already used");
        require(supportedTokens[token], "Token not supported");
        require(amount > 0, "Amount must be greater than zero");

        IERC20 erc20 = IERC20(token);
        uint256 balanceBefore = erc20.balanceOf(address(this));
        erc20.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = erc20.balanceOf(address(this)) - balanceBefore;
        require(received == amount, "Fee-on-transfer tokens not supported");

        bills[billId] = Bill({
            payer: msg.sender,
            token: token,
            amount: amount,
            category: category,
            status: Status.Paid,
            paidAt: uint64(block.timestamp),
            externalRef: externalRef
        });
        totalEscrowed[token] += amount;

        emit BillPaid(billId, msg.sender, token, amount, category, externalRef);
    }

    /// @notice Confirm the off-chain bill purchase succeeded; releases escrowed funds to the treasury.
    function fulfillBill(bytes32 billId) external onlyRole(FULFILLER_ROLE) nonReentrant {
        Bill storage bill = bills[billId];
        require(bill.status == Status.Paid, "Bill is not in a payable state");

        bill.status = Status.Fulfilled;
        totalEscrowed[bill.token] -= bill.amount;
        IERC20(bill.token).safeTransfer(treasury, bill.amount);

        emit BillFulfilled(billId);
    }

    /// @notice Confirm the off-chain bill purchase failed; refunds the payer automatically.
    function failBill(bytes32 billId, string calldata reason) external onlyRole(FULFILLER_ROLE) nonReentrant {
        Bill storage bill = bills[billId];
        require(bill.status == Status.Paid, "Bill is not in a payable state");

        bill.status = Status.Failed;
        address payer = bill.payer;
        address token = bill.token;
        uint256 amount = bill.amount;
        totalEscrowed[token] -= amount;

        IERC20(token).safeTransfer(payer, amount);

        emit BillFailed(billId, reason);
        emit BillRefunded(billId, payer, amount);
    }

    /// @notice Self-serve refund path if the fulfiller never responds within `refundTimeout`.
    function claimTimeoutRefund(bytes32 billId) external nonReentrant {
        Bill storage bill = bills[billId];
        require(bill.status == Status.Paid, "Bill is not in a payable state");
        require(msg.sender == bill.payer, "Only the payer can claim this refund");
        require(block.timestamp >= bill.paidAt + refundTimeout, "Refund timeout not reached yet");

        bill.status = Status.Refunded;
        totalEscrowed[bill.token] -= bill.amount;
        IERC20(bill.token).safeTransfer(bill.payer, bill.amount);

        emit BillRefunded(billId, bill.payer, bill.amount);
    }

    /// @notice Recover tokens sent to this contract outside of `payBill` (e.g. by mistake).
    ///         Cannot touch funds currently escrowed for pending bills.
    function recoverExcessToken(address token, address to) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(to != address(0), "Invalid recipient address");
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 excess = balance - totalEscrowed[token];
        require(excess > 0, "Nothing to recover");
        IERC20(token).safeTransfer(to, excess);
        emit ExcessRecovered(token, to, excess);
    }

    function getBill(bytes32 billId) external view returns (Bill memory) {
        return bills[billId];
    }
}
