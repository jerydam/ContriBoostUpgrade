// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../lib/openzeppelin-contracts/contracts/security/ReentrancyGuard.sol";
import "../lib/openzeppelin-contracts/contracts/utils/math/SafeMath.sol";
import "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

contract GoalFund is ReentrancyGuard, Ownable {
    using SafeMath for uint256;

    enum PaymentMethod {
        Ether,
        ERC20
    }

    enum FundType {
        Group,    // Funds collected for a shared goal
        Personal  // Personal savings with withdrawal conditions
    }

    struct Goal {
        string name;
        string description;
        uint targetAmount;       // Amount to reach (in wei or token units)
        uint currentAmount;      // Current collected amount
        uint deadline;           // Unix timestamp for when funding ends
        bool achieved;           // True if targetAmount is reached
        bool fundsWithdrawn;     // True if funds have been withdrawn
        address payable beneficiary; // Who receives the funds
    }

    PaymentMethod public paymentMethod;
    FundType public fundType;
    IERC20 public token;           // ERC20 token address (if applicable)
    Goal public goal;
    mapping(address => uint) public contributions; // Tracks individual contributions
    address[] public contributors; // List of contributors
    uint public hostFeePercentage; // Fee for the host (e.g., 200 = 2%)
    uint public constant PERCENTAGE_BASE = 10000;

    event Contribution(address indexed contributor, uint amount);
    event GoalAchieved(uint totalAmount, uint timestamp);
    event FundsWithdrawn(address indexed beneficiary, uint amount);
    event RefundIssued(address indexed contributor, uint amount);

    constructor(
        string memory _name,
        string memory _description,
        uint _targetAmount,
        uint _deadline,
        address payable _beneficiary,
        PaymentMethod _paymentMethod,
        address _tokenAddress,
        FundType _fundType,
        uint _hostFeePercentage
    ) {
        require(_targetAmount > 0, "Target amount must be greater than zero");
        require(_deadline > block.timestamp, "Deadline must be in the future");
        require(_beneficiary != address(0), "Invalid beneficiary address");
        require(_hostFeePercentage <= 500, "Host fee cannot exceed 5%"); // Max 5%

        paymentMethod = _paymentMethod;
        fundType = _fundType;
        hostFeePercentage = _hostFeePercentage;
        goal = Goal({
            name: _name,
            description: _description,
            targetAmount: _targetAmount,
            currentAmount: 0,
            deadline: _deadline,
            achieved: false,
            fundsWithdrawn: false,
            beneficiary: _beneficiary
        });

        if (_paymentMethod == PaymentMethod.ERC20 && _tokenAddress != address(0)) {
            token = IERC20(_tokenAddress);
        } else if (_paymentMethod == PaymentMethod.Ether) {
            require(_tokenAddress == address(0), "Token address must be zero for Ether payment");
        } else {
            revert("Invalid payment method configuration");
        }

        _transferOwnership(msg.sender); // Host is the owner
    }

    modifier onlyBeforeDeadline() {
        require(block.timestamp <= goal.deadline, "Funding period has ended");
        _;
    }

    modifier onlyAfterDeadline() {
        require(block.timestamp > goal.deadline, "Funding period is still active");
        _;
    }

    modifier onlyWhenNotWithdrawn() {
        require(!goal.fundsWithdrawn, "Funds have already been withdrawn");
        _;
    }

    // Contribute to the goal
    function contribute() external payable nonReentrant onlyBeforeDeadline {
        uint amount;
        if (paymentMethod == PaymentMethod.Ether) {
            require(msg.value > 0, "Must send Ether");
            amount = msg.value;
        } else {
            require(msg.value == 0, "Ether not accepted for ERC20 payment");
            amount = getTokenContribution();
        }

        if (contributions[msg.sender] == 0) {
            contributors.push(msg.sender);
        }
        contributions[msg.sender] = contributions[msg.sender].add(amount);
        goal.currentAmount = goal.currentAmount.add(amount);

        emit Contribution(msg.sender, amount);

        if (goal.currentAmount >= goal.targetAmount && !goal.achieved) {
            goal.achieved = true;
            emit GoalAchieved(goal.currentAmount, block.timestamp);
        }
    }

    // Helper function for ERC20 contributions
    function getTokenContribution() internal returns (uint) {
        uint allowance = token.allowance(msg.sender, address(this));
        uint balance = token.balanceOf(msg.sender);
        uint amount = allowance < balance ? allowance : balance;
        require(amount > 0, "No tokens approved or available");
        bool success = token.transferFrom(msg.sender, address(this), amount);
        require(success, "Token transfer failed");
        return amount;
    }

    // Withdraw funds (group goal: to beneficiary; personal: to owner)
    function withdrawFunds() external onlyOwner nonReentrant onlyWhenNotWithdrawn {
        if (fundType == FundType.Group) {
            require(goal.achieved, "Goal not achieved yet");
        } else { // Personal
            require(block.timestamp > goal.deadline || goal.achieved, "Cannot withdraw before deadline unless goal met");
        }

        uint totalAmount = getBalance();
        require(totalAmount > 0, "No funds to withdraw");

        uint hostFee = totalAmount.mul(hostFeePercentage).div(PERCENTAGE_BASE);
        uint beneficiaryAmount = totalAmount.sub(hostFee);

        // Pay host fee
        if (hostFee > 0) {
            transferFunds(owner(), hostFee);
        }

        // Pay beneficiary (group) or owner (personal)
        address payable recipient = fundType == FundType.Group ? goal.beneficiary : payable(owner());
        transferFunds(recipient, beneficiaryAmount);

        goal.fundsWithdrawn = true;
        emit FundsWithdrawn(recipient, beneficiaryAmount);
    }

    // Refund contributors if goal not met (group funding only)
    function refundContributors() external onlyOwner nonReentrant onlyAfterDeadline onlyWhenNotWithdrawn {
        require(fundType == FundType.Group, "Refunds only for group funding");
        require(!goal.achieved, "Goal was achieved, no refunds");

        uint totalAmount = getBalance();
        require(totalAmount > 0, "No funds to refund");

        for (uint i = 0; i < contributors.length; i++) {
            address contributor = contributors[i];
            uint contribution = contributions[contributor];
            if (contribution > 0) {
                contributions[contributor] = 0; // Prevent reentrancy
                transferFunds(payable(contributor), contribution);
                emit RefundIssued(contributor, contribution);
            }
        }

        goal.fundsWithdrawn = true;
    }

    // Internal function to transfer funds (Ether or ERC20)
    function transferFunds(address payable recipient, uint amount) internal {
        if (paymentMethod == PaymentMethod.Ether) {
            (bool success, ) = recipient.call{value: amount}("");
            require(success, "Ether transfer failed");
        } else {
            bool success = token.transfer(recipient, amount);
            require(success, "Token transfer failed");
        }
    }

    // Get contract balance
    function getBalance() public view returns (uint) {
        return paymentMethod == PaymentMethod.Ether
            ? address(this).balance
            : token.balanceOf(address(this));
    }

    // Emergency withdrawal by owner
    function emergencyWithdraw() external onlyOwner nonReentrant onlyWhenNotWithdrawn {
        uint totalAmount = getBalance();
        require(totalAmount > 0, "No funds to withdraw");
        transferFunds(payable(owner()), totalAmount);
        goal.fundsWithdrawn = true;
    }

    // View contributor count
    function getContributorCount() external view returns (uint) {
        return contributors.length;
    }

    // Receive Ether (only for Ether-based goals)
    receive() external payable {
        require(paymentMethod == PaymentMethod.Ether, "Ether not accepted for this contract");
        if (block.timestamp <= goal.deadline) {
            contribute();
        }
    }
}
