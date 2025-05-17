// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../lib/openzeppelin-contracts/contracts/security/ReentrancyGuard.sol";
import "../lib/openzeppelin-contracts/contracts/utils/math/SafeMath.sol";
import "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

contract GoalFund is ReentrancyGuard, Ownable() {
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
    uint public platformFeePercentage; // Fee for the platform owner (set by factory)
    address public platformOwner;      // Address of the platform owner (factory deployer)
    uint public constant PERCENTAGE_BASE = 10000;

    event Contribution(address indexed contributor, uint amount);
    event GoalAchieved(uint totalAmount, uint timestamp);
    event FundsWithdrawn(address indexed beneficiary, uint amount);
    event RefundIssued(address indexed contributor, uint amount);
    event PlatformFeeTransferred(address indexed platformOwner, uint amount);

    constructor(
        string memory _name,
        string memory _description,
        uint _targetAmount,
        uint _deadline,
        address payable _beneficiary,
        PaymentMethod _paymentMethod,
        address _tokenAddress,
        FundType _fundType,
        uint _platformFeePercentage,
        address _platformOwner,
        address _host
    ) {
        require(_targetAmount > 0, "Target amount must be greater than zero");
        require(_deadline > block.timestamp, "Deadline must be in the future");
        require(_beneficiary != address(0), "Invalid beneficiary address");
        require(_platformFeePercentage <= 500, "Platform fee cannot exceed 5%"); // Max 5%
        require(_platformOwner != address(0), "Invalid platform owner address");

        paymentMethod = _paymentMethod;
        fundType = _fundType;
        platformFeePercentage = _platformFeePercentage;
        platformOwner = _platformOwner;
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

        _transferOwnership(_host); // Host manages the contract
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

  function _contribute(address contributor, uint256 amount) internal {
        if (contributions[contributor] == 0) {
            contributors.push(contributor);
        }
        contributions[contributor] = contributions[contributor].add(amount);
        goal.currentAmount = goal.currentAmount.add(amount);

        emit Contribution(contributor, amount);

        if (goal.currentAmount >= goal.targetAmount && !goal.achieved) {
            goal.achieved = true;
            emit GoalAchieved(goal.currentAmount, block.timestamp);
        }
    }

    function contribute(uint256 amount) external payable nonReentrant onlyBeforeDeadline {
        require(amount > 0, "Contribution amount must be greater than zero");

        if (paymentMethod == PaymentMethod.Ether) {
            require(msg.value == amount, "Sent Ether must equal specified amount");
            _contribute(msg.sender, amount);
        } else {
            require(msg.value == 0, "Ether not accepted for ERC20 payment");
            require(token.allowance(msg.sender, address(this)) >= amount, "Insufficient token allowance");
            require(token.balanceOf(msg.sender) >= amount, "Insufficient token balance");
            bool success = token.transferFrom(msg.sender, address(this), amount);
            require(success, "Token transfer failed");
            _contribute(msg.sender, amount);
        }
    }
    function getTokenContribution() internal returns (uint) {
        uint allowance = token.allowance(msg.sender, address(this));
        uint balance = token.balanceOf(msg.sender);
        uint amount = allowance < balance ? allowance : balance;
        require(amount > 0, "No tokens approved or available");
        bool success = token.transferFrom(msg.sender, address(this), amount);
        require(success, "Token transfer failed");
        return amount;
    }

    function withdrawFunds() external onlyOwner nonReentrant onlyWhenNotWithdrawn {
        if (fundType == FundType.Group) {
            require(goal.achieved, "Goal not achieved yet");
        } else {
            require(block.timestamp > goal.deadline || goal.achieved, "Cannot withdraw before deadline unless goal met");
        }

        uint totalAmount = getBalance();
        require(totalAmount > 0, "No funds to withdraw");

        uint platformFee = totalAmount.mul(platformFeePercentage).div(PERCENTAGE_BASE);
        uint beneficiaryAmount = totalAmount.sub(platformFee);

        if (platformFee > 0) {
            transferFunds(payable(platformOwner), platformFee);
            emit PlatformFeeTransferred(platformOwner, platformFee);
        }

        address payable recipient = fundType == FundType.Group ? goal.beneficiary : payable(owner());
        transferFunds(recipient, beneficiaryAmount);

        goal.fundsWithdrawn = true;
        emit FundsWithdrawn(recipient, beneficiaryAmount);
    }

    function refundContributors() external onlyOwner nonReentrant onlyAfterDeadline onlyWhenNotWithdrawn {
        require(fundType == FundType.Group, "Refunds only for group funding");
        require(!goal.achieved, "Goal was achieved, no refunds");

        for (uint i = 0; i < contributors.length; i++) {
            address contributor = contributors[i];
            uint contribution = contributions[contributor];
            if (contribution > 0) {
                contributions[contributor] = 0;
                transferFunds(payable(contributor), contribution);
                emit RefundIssued(contributor, contribution);
            }
        }

        goal.fundsWithdrawn = true;
    }

    function transferFunds(address payable recipient, uint amount) internal {
        if (paymentMethod == PaymentMethod.Ether) {
            (bool success, ) = recipient.call{value: amount}("");
            require(success, "Ether transfer failed");
        } else {
            bool success = token.transfer(recipient, amount);
            require(success, "Token transfer failed");
        }
    }

    function getBalance() public view returns (uint) {
        return paymentMethod == PaymentMethod.Ether
            ? address(this).balance
            : token.balanceOf(address(this));
    }

    function emergencyWithdraw() external onlyOwner nonReentrant onlyWhenNotWithdrawn {
        uint totalAmount = getBalance();
        require(totalAmount > 0, "No funds to withdraw");
        transferFunds(payable(owner()), totalAmount);
        goal.fundsWithdrawn = true;
    }

    function getContributorCount() external view returns (uint) {
        return contributors.length;
    }

    receive() external payable nonReentrant onlyBeforeDeadline {
        require(paymentMethod == PaymentMethod.Ether, "Ether not accepted for this contract");
        require(msg.value > 0, "Must send Ether");
        _contribute(msg.sender, msg.value);
    }
}