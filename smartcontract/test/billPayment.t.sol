// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../lib/forge-std/src/Test.sol";
import "../src/billPayment.sol";
import "../lib/openzeppelin-contracts/contracts/mocks/ERC20Mock.sol";

contract BillPaymentTest is Test {
    BillPayment public billPayment;
    ERC20Mock public token;

    address public admin = address(0xA11CE);
    address public treasury = address(0x7EA5);
    address public payer = address(0xB0B);

    uint256 public constant PAYER_BALANCE = 1_000 ether;

    function setUp() public {
        vm.prank(admin);
        billPayment = new BillPayment(admin, treasury);

        token = new ERC20Mock("Celo Dollar", "cUSD", payer, PAYER_BALANCE);

        vm.prank(admin);
        billPayment.setSupportedToken(address(token), true);

        vm.prank(payer);
        token.approve(address(billPayment), type(uint256).max);
    }

    function _payBill(bytes32 billId, uint256 amount) internal {
        vm.prank(payer);
        billPayment.payBill(billId, address(token), amount, BillPayment.Category.Airtime, keccak256("ref-1"));
    }

    function test_payBill_escrowsFunds() public {
        bytes32 billId = keccak256("bill-1");
        uint256 amount = 10 ether;

        _payBill(billId, amount);

        assertEq(token.balanceOf(address(billPayment)), amount);
        assertEq(token.balanceOf(payer), PAYER_BALANCE - amount);
        assertEq(billPayment.totalEscrowed(address(token)), amount);

        BillPayment.Bill memory bill = billPayment.getBill(billId);
        assertEq(bill.payer, payer);
        assertEq(uint(bill.status), uint(BillPayment.Status.Paid));
        assertEq(bill.amount, amount);
    }

    function test_payBill_rejectsUnsupportedToken() public {
        ERC20Mock other = new ERC20Mock("Other", "OTH", payer, PAYER_BALANCE);
        vm.prank(payer);
        other.approve(address(billPayment), type(uint256).max);

        vm.expectRevert("Token not supported");
        vm.prank(payer);
        billPayment.payBill(keccak256("bill-x"), address(other), 1 ether, BillPayment.Category.Airtime, bytes32(0));
    }

    function test_payBill_rejectsReusedBillId() public {
        bytes32 billId = keccak256("bill-dup");
        _payBill(billId, 5 ether);

        vm.expectRevert("billId already used");
        _payBill(billId, 5 ether);
    }

    function test_fulfillBill_releasesToTreasury() public {
        bytes32 billId = keccak256("bill-2");
        uint256 amount = 20 ether;
        _payBill(billId, amount);

        vm.prank(admin);
        billPayment.fulfillBill(billId);

        assertEq(token.balanceOf(treasury), amount);
        assertEq(token.balanceOf(address(billPayment)), 0);
        assertEq(billPayment.totalEscrowed(address(token)), 0);
        assertEq(uint(billPayment.getBill(billId).status), uint(BillPayment.Status.Fulfilled));
    }

    function test_fulfillBill_onlyFulfillerRole() public {
        bytes32 billId = keccak256("bill-3");
        _payBill(billId, 1 ether);

        vm.expectRevert();
        vm.prank(payer);
        billPayment.fulfillBill(billId);
    }

    function test_failBill_refundsPayerImmediately() public {
        bytes32 billId = keccak256("bill-4");
        uint256 amount = 15 ether;
        _payBill(billId, amount);

        vm.prank(admin);
        billPayment.failBill(billId, "provider timeout");

        assertEq(token.balanceOf(payer), PAYER_BALANCE);
        assertEq(billPayment.totalEscrowed(address(token)), 0);
        assertEq(uint(billPayment.getBill(billId).status), uint(BillPayment.Status.Failed));
    }

    function test_claimTimeoutRefund_beforeTimeout_reverts() public {
        bytes32 billId = keccak256("bill-5");
        _payBill(billId, 3 ether);

        vm.expectRevert("Refund timeout not reached yet");
        vm.prank(payer);
        billPayment.claimTimeoutRefund(billId);
    }

    function test_claimTimeoutRefund_afterTimeout_succeeds() public {
        bytes32 billId = keccak256("bill-6");
        uint256 amount = 8 ether;
        _payBill(billId, amount);

        vm.warp(block.timestamp + billPayment.refundTimeout() + 1);

        vm.prank(payer);
        billPayment.claimTimeoutRefund(billId);

        assertEq(token.balanceOf(payer), PAYER_BALANCE);
        assertEq(uint(billPayment.getBill(billId).status), uint(BillPayment.Status.Refunded));
    }

    function test_claimTimeoutRefund_onlyPayer() public {
        bytes32 billId = keccak256("bill-7");
        _payBill(billId, 2 ether);
        vm.warp(block.timestamp + billPayment.refundTimeout() + 1);

        vm.expectRevert("Only the payer can claim this refund");
        billPayment.claimTimeoutRefund(billId);
    }

    function test_cannotFulfillTwice() public {
        bytes32 billId = keccak256("bill-8");
        _payBill(billId, 4 ether);

        vm.prank(admin);
        billPayment.fulfillBill(billId);

        vm.expectRevert("Bill is not in a payable state");
        vm.prank(admin);
        billPayment.fulfillBill(billId);
    }

    function test_pause_blocksPayBill() public {
        vm.prank(admin);
        billPayment.pause();

        vm.expectRevert();
        _payBill(keccak256("bill-9"), 1 ether);
    }

    function test_recoverExcessToken_onlyRecoversUnescrowedBalance() public {
        bytes32 billId = keccak256("bill-10");
        uint256 amount = 6 ether;
        _payBill(billId, amount);

        // Someone accidentally sends tokens directly to the contract.
        uint256 accidental = 2 ether;
        vm.prank(payer);
        token.transfer(address(billPayment), accidental);

        vm.prank(admin);
        billPayment.recoverExcessToken(address(token), admin);

        assertEq(token.balanceOf(admin), accidental);
        // Escrowed bill funds must remain untouched.
        assertEq(token.balanceOf(address(billPayment)), amount);
    }

    function test_recoverExcessToken_revertsWhenNothingToRecover() public {
        bytes32 billId = keccak256("bill-11");
        _payBill(billId, 1 ether);

        vm.expectRevert("Nothing to recover");
        vm.prank(admin);
        billPayment.recoverExcessToken(address(token), admin);
    }
}
