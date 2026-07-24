// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/contriboost.sol";
import "../lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

// Mock ERC20 token for testing
contract MockERC20 is ERC20 {
    constructor() ERC20("Mock Token", "MTK") {
        _mint(msg.sender, 1000000 * 10**18);
    }
}

contract ContriboostTest is Test {
    Contriboost contriboostERC20;
    Contriboost contriboostEther;
    MockERC20 token;

    address owner = address(0x1); // host
    address platformOwner = address(0x5);
    address participant1 = address(0x2);
    address participant2 = address(0x3);
    address participant3 = address(0x4);

    uint constant DAY_RANGE = 7;
    uint constant EXPECTED_NUMBER = 3;
    uint constant CONTRIBUTION_AMOUNT = 100 * 10**18;
    uint constant HOST_FEE_PERCENTAGE = 200; // 2%
    uint constant PLATFORM_FEE_PERCENTAGE = 200; // 2%
    uint constant MAX_MISSED_DEPOSITS = 2;
    uint startTimestamp;

    function _config(Contriboost.PaymentMethod method) internal view returns (Contriboost.Config memory) {
        return Contriboost.Config({
            dayRange: DAY_RANGE,
            expectedNumber: EXPECTED_NUMBER,
            contributionAmount: CONTRIBUTION_AMOUNT,
            hostFeePercentage: HOST_FEE_PERCENTAGE,
            platformFeePercentage: PLATFORM_FEE_PERCENTAGE,
            maxMissedDeposits: MAX_MISSED_DEPOSITS,
            startTimestamp: startTimestamp,
            paymentMethod: method
        });
    }

    function setUp() public {
        vm.startPrank(owner);

        token = new MockERC20();
        startTimestamp = block.timestamp + 1 days;

        contriboostERC20 = new Contriboost(
            _config(Contriboost.PaymentMethod.ERC20),
            "Test Contriboost ERC20",
            "Test Description",
            address(token),
            platformOwner,
            owner
        );

        contriboostEther = new Contriboost(
            _config(Contriboost.PaymentMethod.Ether),
            "Test Contriboost Ether",
            "Test Description",
            address(0),
            platformOwner,
            owner
        );

        token.transfer(participant1, 10000 * 10**18);
        token.transfer(participant2, 10000 * 10**18);
        token.transfer(participant3, 10000 * 10**18);

        // Participants join before the cycle starts...
        vm.stopPrank();
        vm.prank(participant1);
        contriboostERC20.join();
        vm.prank(participant2);
        contriboostERC20.join();
        vm.prank(participant3);
        contriboostERC20.join();

        vm.prank(participant1);
        contriboostEther.join();
        vm.prank(participant2);
        contriboostEther.join();
        vm.prank(participant3);
        contriboostEther.join();

        // ...then time moves past startTimestamp so deposits/distribution can happen.
        vm.warp(startTimestamp + 1);

        vm.deal(participant1, CONTRIBUTION_AMOUNT);
    }

    function testInitialState() public view {
        assertEq(contriboostERC20.name(), "Test Contriboost ERC20");
        assertEq(contriboostERC20.dayRange(), DAY_RANGE);
        assertEq(contriboostERC20.expectedNumber(), EXPECTED_NUMBER);
        assertEq(contriboostERC20.contributionAmount(), CONTRIBUTION_AMOUNT);
        assertEq(contriboostERC20.hostFeePercentage(), HOST_FEE_PERCENTAGE);
        assertEq(contriboostERC20.maxMissedDeposits(), MAX_MISSED_DEPOSITS);
        assertEq(contriboostERC20.host(), owner);
        assertEq(contriboostERC20.owner(), owner);
        assertEq(uint(contriboostERC20.paymentMethod()), uint(Contriboost.PaymentMethod.ERC20));
    }

    function testJoin() public {
        Contriboost.Config memory cfg = _config(Contriboost.PaymentMethod.ERC20);
        cfg.startTimestamp = block.timestamp + 1 days; // fresh join window, still open

        vm.prank(owner);
        Contriboost newContriboost = new Contriboost(
            cfg,
            "Test Contriboost",
            "Test Description",
            address(token),
            platformOwner,
            owner
        );

        vm.prank(participant1);
        newContriboost.join();

        (, , , bool exists, , bool active, ) = newContriboost.getParticipantStatus(participant1);
        assertTrue(exists);
        assertTrue(active);
        assertEq(newContriboost.getAllParticipants().length, 1);
    }

    function testJoin_revertsAfterExpectedNumberReached() public {
        // contriboostERC20 already has 3 participants (== EXPECTED_NUMBER) from setUp.
        address participant4 = address(0x6);
        vm.prank(participant4);
        vm.expectRevert("Maximum participants reached");
        contriboostERC20.join();
    }

    function testJoin_revertsAfterStartTimestamp() public {
        // block.timestamp is already past startTimestamp at this point in every test (see setUp).
        address participant4 = address(0x6);
        Contriboost.Config memory cfg = _config(Contriboost.PaymentMethod.ERC20);
        cfg.startTimestamp = block.timestamp + 1 days;
        vm.prank(owner);
        Contriboost newContriboost = new Contriboost(
            cfg,
            "Test Contriboost",
            "Test Description",
            address(token),
            platformOwner,
            owner
        );

        vm.warp(cfg.startTimestamp + 1);
        vm.prank(participant4);
        vm.expectRevert("Joining period has ended");
        newContriboost.join();
    }

    function testDeposit() public {
        vm.startPrank(participant1);
        token.approve(address(contriboostERC20), CONTRIBUTION_AMOUNT * 10);
        contriboostERC20.deposit();
        vm.stopPrank();

        (, uint depositAmount, , , , , ) = contriboostERC20.getParticipantStatus(participant1);
        assertEq(depositAmount, CONTRIBUTION_AMOUNT);
        assertEq(token.balanceOf(address(contriboostERC20)), CONTRIBUTION_AMOUNT);
    }

    function testFullCycle() public {
        vm.prank(participant1);
        token.approve(address(contriboostERC20), CONTRIBUTION_AMOUNT * 10);
        vm.prank(participant2);
        token.approve(address(contriboostERC20), CONTRIBUTION_AMOUNT * 10);
        vm.prank(participant3);
        token.approve(address(contriboostERC20), CONTRIBUTION_AMOUNT * 10);

        vm.prank(participant1);
        contriboostERC20.deposit();
        vm.prank(participant2);
        contriboostERC20.deposit();
        vm.prank(participant3);
        contriboostERC20.deposit();

        uint totalAmount = CONTRIBUTION_AMOUNT * 3;
        uint hostFee = (totalAmount * HOST_FEE_PERCENTAGE) / 10000;
        uint platformFee = (totalAmount * PLATFORM_FEE_PERCENTAGE) / 10000;
        uint recipientAmount = totalAmount - hostFee - platformFee;

        uint initialOwnerBalance = token.balanceOf(owner);
        uint initialPlatformOwnerBalance = token.balanceOf(platformOwner);
        uint initialParticipant1Balance = token.balanceOf(participant1);

        vm.prank(owner);
        contriboostERC20.distributeFunds();

        assertEq(token.balanceOf(participant1), initialParticipant1Balance + recipientAmount);
        assertEq(token.balanceOf(owner), initialOwnerBalance + hostFee);
        assertEq(token.balanceOf(platformOwner), initialPlatformOwnerBalance + platformFee);
        assertEq(contriboostERC20.currentSegment(), 2);
    }

    function testMissedDeposits() public {
        vm.startPrank(participant1);
        token.approve(address(contriboostERC20), CONTRIBUTION_AMOUNT * 10);
        contriboostERC20.deposit();
        vm.stopPrank();

        vm.warp(startTimestamp + (DAY_RANGE * 3 days) + 2);
        vm.prank(owner);
        contriboostERC20.distributeFunds();
        vm.prank(owner);
        contriboostERC20.checkMissedDeposits();

        (, , , , , bool active, uint missedDeposits) = contriboostERC20.getParticipantStatus(participant2);
        assertFalse(active);
        assertEq(missedDeposits, 2);
    }

    function testReactivation() public {
        // participant1 deposits normally, so it should never be flagged as missed
        // (its own deposit marks segmentParticipation for the current segment).
        vm.startPrank(participant1);
        token.approve(address(contriboostERC20), CONTRIBUTION_AMOUNT * 10);
        contriboostERC20.deposit();
        vm.stopPrank();

        // participant2 never deposits, so misses accumulate for it instead.
        vm.warp(startTimestamp + DAY_RANGE * 1 days + 2);
        vm.prank(owner);
        contriboostERC20.checkMissedDeposits();
        vm.warp(startTimestamp + DAY_RANGE * 2 days + 2);
        vm.prank(owner);
        contriboostERC20.checkMissedDeposits();

        (, , , , , bool activeBefore, uint missedBefore) = contriboostERC20.getParticipantStatus(participant2);
        assertFalse(activeBefore);
        assertEq(missedBefore, 2);

        vm.startPrank(participant2);
        token.approve(address(contriboostERC20), CONTRIBUTION_AMOUNT * 2); // 2 missed deposits
        contriboostERC20.reactivateParticipant();
        vm.stopPrank();

        (, , , , , bool active, uint missedDeposits) = contriboostERC20.getParticipantStatus(participant2);
        assertTrue(active);
        assertEq(missedDeposits, 0);
    }

    function testEmergencyWithdraw() public {
        // ERC20 withdrawal
        vm.startPrank(participant1);
        token.approve(address(contriboostERC20), CONTRIBUTION_AMOUNT);
        contriboostERC20.deposit();
        vm.stopPrank();

        uint contractTokenBalance = token.balanceOf(address(contriboostERC20));
        uint initialOwnerTokenBalance = token.balanceOf(owner);

        vm.prank(owner);
        contriboostERC20.emergencyWithdraw(address(token));

        assertEq(token.balanceOf(address(contriboostERC20)), 0);
        assertEq(token.balanceOf(owner), initialOwnerTokenBalance + contractTokenBalance);

        // Ether withdrawal
        vm.startPrank(participant1);
        contriboostEther.deposit{value: CONTRIBUTION_AMOUNT}();
        vm.stopPrank();

        uint contractEtherBalance = address(contriboostEther).balance;
        assertEq(contractEtherBalance, CONTRIBUTION_AMOUNT); // Verify deposit worked

        uint initialOwnerEtherBalance = owner.balance;
        vm.prank(owner);
        contriboostEther.emergencyWithdraw(address(0));

        assertEq(address(contriboostEther).balance, 0);
        assertEq(owner.balance, initialOwnerEtherBalance + contractEtherBalance);
    }
}
