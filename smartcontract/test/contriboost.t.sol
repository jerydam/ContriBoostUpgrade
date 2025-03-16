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
    
    address owner = address(0x1);
    address participant1 = address(0x2);
    address participant2 = address(0x3);
    address participant3 = address(0x4);

    uint constant DAY_RANGE = 7;
    uint constant EXPECTED_NUMBER = 3;
    uint constant CONTRIBUTION_AMOUNT = 100 * 10**18;
    uint constant HOST_FEE_PERCENTAGE = 200; // 2%
    uint constant MAX_MISSED_DEPOSITS = 2;
    uint startTimestamp;

    function setUp() public {
        vm.startPrank(owner);
        
        token = new MockERC20();
        startTimestamp = block.timestamp + 1 days;
        
        contriboostERC20 = new Contriboost(
            DAY_RANGE,
            EXPECTED_NUMBER,
            CONTRIBUTION_AMOUNT,
            "Test Contriboost ERC20",
            "Test Description",
            address(token),
            HOST_FEE_PERCENTAGE,
            MAX_MISSED_DEPOSITS,
            startTimestamp,
            Contriboost.PaymentMethod.ERC20
        );

        contriboostEther = new Contriboost(
            DAY_RANGE,
            EXPECTED_NUMBER,
            CONTRIBUTION_AMOUNT,
            "Test Contriboost Ether",
            "Test Description",
            address(0),
            HOST_FEE_PERCENTAGE,
            MAX_MISSED_DEPOSITS,
            startTimestamp,
            Contriboost.PaymentMethod.Ether
        );

        token.transfer(participant1, 10000 * 10**18);
        token.transfer(participant2, 10000 * 10**18);
        token.transfer(participant3, 10000 * 10**18);
        
        vm.warp(startTimestamp + 1);
        contriboostERC20.addParticipant(participant1);
        contriboostERC20.addParticipant(participant2);
        contriboostERC20.addParticipant(participant3);

        contriboostEther.addParticipant(participant1);
        contriboostEther.addParticipant(participant2);
        contriboostEther.addParticipant(participant3);
        
        vm.deal(participant1, 1 ether);
        
        vm.stopPrank();
    }

    function testInitialState() public view {
        assertEq(contriboostERC20.name(), "Test Contriboost ERC20");
        assertEq(contriboostERC20.dayRange(), DAY_RANGE);
        assertEq(contriboostERC20.expectedNumber(), EXPECTED_NUMBER);
        assertEq(contriboostERC20.contributionAmount(), CONTRIBUTION_AMOUNT);
        assertEq(contriboostERC20.hostFeePercentage(), HOST_FEE_PERCENTAGE);
        assertEq(contriboostERC20.maxMissedDeposits(), MAX_MISSED_DEPOSITS);
        assertEq(contriboostERC20.host(), owner);
        assertEq(uint(contriboostERC20.paymentMethod()), uint(Contriboost.PaymentMethod.ERC20));
    }

    function testJoin() public {
        vm.startPrank(owner);
        Contriboost newContriboost = new Contriboost(
            DAY_RANGE,
            EXPECTED_NUMBER,
            CONTRIBUTION_AMOUNT,
            "Test Contriboost",
            "Test Description",
            address(token),
            HOST_FEE_PERCENTAGE,
            MAX_MISSED_DEPOSITS,
            block.timestamp + 1 days,
            Contriboost.PaymentMethod.ERC20
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 2 days);
        
        vm.prank(participant1);
        newContriboost.join();
        
        (, , , bool exists, , bool active, ) = newContriboost.getParticipantStatus(participant1);
        assertTrue(exists);
        assertTrue(active);
        assertEq(newContriboost.getAllParticipants().length, 1);
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
        uint recipientAmount = totalAmount - hostFee;

        uint initialOwnerBalance = token.balanceOf(owner);
        uint initialParticipant1Balance = token.balanceOf(participant1);

        vm.prank(owner);
        contriboostERC20.distributeFunds();

        assertEq(token.balanceOf(participant1), initialParticipant1Balance + recipientAmount);
        assertEq(token.balanceOf(owner), initialOwnerBalance + hostFee);
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
        // Initial deposit to set baseline
        vm.startPrank(participant1);
        token.approve(address(contriboostERC20), CONTRIBUTION_AMOUNT * 10);
        contriboostERC20.deposit();
        vm.stopPrank();

        // Warp and check multiple times to accumulate missed deposits
        vm.warp(startTimestamp + DAY_RANGE * 1 days + 2);
        vm.prank(owner);
        contriboostERC20.checkMissedDeposits();
        vm.warp(startTimestamp + DAY_RANGE * 2 days + 2);
        vm.prank(owner);
        contriboostERC20.checkMissedDeposits();

        (, , , , , bool activeBefore, uint missedBefore) = contriboostERC20.getParticipantStatus(participant1);
        assertFalse(activeBefore);
        assertEq(missedBefore, 2);

        vm.startPrank(participant1);
        token.approve(address(contriboostERC20), CONTRIBUTION_AMOUNT * 2); // 2 missed deposits
        contriboostERC20.reactivateParticipant();
        vm.stopPrank();

        (, , , , , bool active, uint missedDeposits) = contriboostERC20.getParticipantStatus(participant1);
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