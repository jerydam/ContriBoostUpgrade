// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/Nestora.sol";
import "../lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

// Mock ERC20 token for testing
contract MockERC20 is ERC20 {
    constructor() ERC20("Mock Token", "MTK") {
        _mint(msg.sender, 1000000 * 10**18);
    }
}

contract NestoraTest is Test {
    Nestora NestoraERC20;
    Nestora NestoraEther;
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

    function _config(Nestora.PaymentMethod method) internal view returns (Nestora.Config memory) {
        return Nestora.Config({
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

        NestoraERC20 = new Nestora(
            _config(Nestora.PaymentMethod.ERC20),
            "Test Nestora ERC20",
            "Test Description",
            address(token),
            platformOwner,
            owner
        );

        NestoraEther = new Nestora(
            _config(Nestora.PaymentMethod.Ether),
            "Test Nestora Ether",
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
        NestoraERC20.join();
        vm.prank(participant2);
        NestoraERC20.join();
        vm.prank(participant3);
        NestoraERC20.join();

        vm.prank(participant1);
        NestoraEther.join();
        vm.prank(participant2);
        NestoraEther.join();
        vm.prank(participant3);
        NestoraEther.join();

        // ...then time moves past startTimestamp so deposits/distribution can happen.
        vm.warp(startTimestamp + 1);

        vm.deal(participant1, CONTRIBUTION_AMOUNT);
    }

    function testInitialState() public view {
        assertEq(NestoraERC20.name(), "Test Nestora ERC20");
        assertEq(NestoraERC20.dayRange(), DAY_RANGE);
        assertEq(NestoraERC20.expectedNumber(), EXPECTED_NUMBER);
        assertEq(NestoraERC20.contributionAmount(), CONTRIBUTION_AMOUNT);
        assertEq(NestoraERC20.hostFeePercentage(), HOST_FEE_PERCENTAGE);
        assertEq(NestoraERC20.maxMissedDeposits(), MAX_MISSED_DEPOSITS);
        assertEq(NestoraERC20.host(), owner);
        assertEq(NestoraERC20.owner(), owner);
        assertEq(uint(NestoraERC20.paymentMethod()), uint(Nestora.PaymentMethod.ERC20));
    }

    function testJoin() public {
        Nestora.Config memory cfg = _config(Nestora.PaymentMethod.ERC20);
        cfg.startTimestamp = block.timestamp + 1 days; // fresh join window, still open

        vm.prank(owner);
        Nestora newNestora = new Nestora(
            cfg,
            "Test Nestora",
            "Test Description",
            address(token),
            platformOwner,
            owner
        );

        vm.prank(participant1);
        newNestora.join();

        (, , , bool exists, , bool active, ) = newNestora.getParticipantStatus(participant1);
        assertTrue(exists);
        assertTrue(active);
        assertEq(newNestora.getAllParticipants().length, 1);
    }

    function testJoin_revertsAfterExpectedNumberReached() public {
        // NestoraERC20 already has 3 participants (== EXPECTED_NUMBER) from setUp.
        address participant4 = address(0x6);
        vm.prank(participant4);
        vm.expectRevert("Maximum participants reached");
        NestoraERC20.join();
    }

    function testJoin_revertsAfterStartTimestamp() public {
        // block.timestamp is already past startTimestamp at this point in every test (see setUp).
        address participant4 = address(0x6);
        Nestora.Config memory cfg = _config(Nestora.PaymentMethod.ERC20);
        cfg.startTimestamp = block.timestamp + 1 days;
        vm.prank(owner);
        Nestora newNestora = new Nestora(
            cfg,
            "Test Nestora",
            "Test Description",
            address(token),
            platformOwner,
            owner
        );

        vm.warp(cfg.startTimestamp + 1);
        vm.prank(participant4);
        vm.expectRevert("Joining period has ended");
        newNestora.join();
    }

    function testDeposit() public {
        vm.startPrank(participant1);
        token.approve(address(NestoraERC20), CONTRIBUTION_AMOUNT * 10);
        NestoraERC20.deposit();
        vm.stopPrank();

        (, uint depositAmount, , , , , ) = NestoraERC20.getParticipantStatus(participant1);
        assertEq(depositAmount, CONTRIBUTION_AMOUNT);
        assertEq(token.balanceOf(address(NestoraERC20)), CONTRIBUTION_AMOUNT);
    }

    function testFullCycle() public {
        vm.prank(participant1);
        token.approve(address(NestoraERC20), CONTRIBUTION_AMOUNT * 10);
        vm.prank(participant2);
        token.approve(address(NestoraERC20), CONTRIBUTION_AMOUNT * 10);
        vm.prank(participant3);
        token.approve(address(NestoraERC20), CONTRIBUTION_AMOUNT * 10);

        vm.prank(participant1);
        NestoraERC20.deposit();
        vm.prank(participant2);
        NestoraERC20.deposit();
        vm.prank(participant3);
        NestoraERC20.deposit();

        uint totalAmount = CONTRIBUTION_AMOUNT * 3;
        uint hostFee = (totalAmount * HOST_FEE_PERCENTAGE) / 10000;
        uint platformFee = (totalAmount * PLATFORM_FEE_PERCENTAGE) / 10000;
        uint recipientAmount = totalAmount - hostFee - platformFee;

        uint initialOwnerBalance = token.balanceOf(owner);
        uint initialPlatformOwnerBalance = token.balanceOf(platformOwner);
        uint initialParticipant1Balance = token.balanceOf(participant1);

        vm.prank(owner);
        NestoraERC20.distributeFunds();

        assertEq(token.balanceOf(participant1), initialParticipant1Balance + recipientAmount);
        assertEq(token.balanceOf(owner), initialOwnerBalance + hostFee);
        assertEq(token.balanceOf(platformOwner), initialPlatformOwnerBalance + platformFee);
        assertEq(NestoraERC20.currentSegment(), 2);
    }

    function testMissedDeposits() public {
        vm.startPrank(participant1);
        token.approve(address(NestoraERC20), CONTRIBUTION_AMOUNT * 10);
        NestoraERC20.deposit();
        vm.stopPrank();

        vm.warp(startTimestamp + (DAY_RANGE * 3 days) + 2);
        vm.prank(owner);
        NestoraERC20.distributeFunds();
        vm.prank(owner);
        NestoraERC20.checkMissedDeposits();

        (, , , , , bool active, uint missedDeposits) = NestoraERC20.getParticipantStatus(participant2);
        assertFalse(active);
        assertEq(missedDeposits, 2);
    }

    function testReactivation() public {
        // participant1 deposits normally, so it should never be flagged as missed
        // (its own deposit marks segmentParticipation for the current segment).
        vm.startPrank(participant1);
        token.approve(address(NestoraERC20), CONTRIBUTION_AMOUNT * 10);
        NestoraERC20.deposit();
        vm.stopPrank();

        // participant2 never deposits, so misses accumulate for it instead.
        vm.warp(startTimestamp + DAY_RANGE * 1 days + 2);
        vm.prank(owner);
        NestoraERC20.checkMissedDeposits();
        vm.warp(startTimestamp + DAY_RANGE * 2 days + 2);
        vm.prank(owner);
        NestoraERC20.checkMissedDeposits();

        (, , , , , bool activeBefore, uint missedBefore) = NestoraERC20.getParticipantStatus(participant2);
        assertFalse(activeBefore);
        assertEq(missedBefore, 2);

        vm.startPrank(participant2);
        token.approve(address(NestoraERC20), CONTRIBUTION_AMOUNT * 2); // 2 missed deposits
        NestoraERC20.reactivateParticipant();
        vm.stopPrank();

        (, , , , , bool active, uint missedDeposits) = NestoraERC20.getParticipantStatus(participant2);
        assertTrue(active);
        assertEq(missedDeposits, 0);
    }

    function testEmergencyWithdraw() public {
        // ERC20 withdrawal
        vm.startPrank(participant1);
        token.approve(address(NestoraERC20), CONTRIBUTION_AMOUNT);
        NestoraERC20.deposit();
        vm.stopPrank();

        uint contractTokenBalance = token.balanceOf(address(NestoraERC20));
        uint initialOwnerTokenBalance = token.balanceOf(owner);

        vm.prank(owner);
        NestoraERC20.emergencyWithdraw(address(token));

        assertEq(token.balanceOf(address(NestoraERC20)), 0);
        assertEq(token.balanceOf(owner), initialOwnerTokenBalance + contractTokenBalance);

        // Ether withdrawal
        vm.startPrank(participant1);
        NestoraEther.deposit{value: CONTRIBUTION_AMOUNT}();
        vm.stopPrank();

        uint contractEtherBalance = address(NestoraEther).balance;
        assertEq(contractEtherBalance, CONTRIBUTION_AMOUNT); // Verify deposit worked

        uint initialOwnerEtherBalance = owner.balance;
        vm.prank(owner);
        NestoraEther.emergencyWithdraw(address(0));

        assertEq(address(NestoraEther).balance, 0);
        assertEq(owner.balance, initialOwnerEtherBalance + contractEtherBalance);
    }
}
