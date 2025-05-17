// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../lib/openzeppelin-contracts/contracts/security/ReentrancyGuard.sol";
import "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "./goalFund.sol";

contract GoalFundFactory is ReentrancyGuard, Ownable {
    address[] public allGoalFunds;
    mapping(address => address[]) public userGoalFunds;
    uint public platformFeePercentage = 200; // Fixed at 2%
    address public platformOwner;

    event GoalFundCreated(address indexed host, address goalFundAddress);

    enum PaymentMethod { Ether, ERC20 }

    struct GoalFundDetails {
        address contractAddress;
        string name;
        uint targetAmount;
        uint currentAmount;
        uint deadline;
        address beneficiary;
        address tokenAddress;
        GoalFund.FundType fundType;
        uint platformFeePercentage;
    }

    constructor() Ownable() {
        platformOwner = msg.sender;
    }

    function createGoalFund(
        string memory _name,
        string memory _description,
        uint _targetAmount,
        uint _deadline,
        address payable _beneficiary,
        PaymentMethod _paymentMethod,
        address _tokenAddress,
        GoalFund.FundType _fundType
    ) external {
        require(_deadline > block.timestamp, "Deadline must be in future");

        GoalFund newGoalFund = new GoalFund(
            _name,
            _description,
            _targetAmount,
            _deadline,
            _beneficiary,
            GoalFund.PaymentMethod(uint(_paymentMethod)),
            _tokenAddress,
            _fundType,
            platformFeePercentage,
            platformOwner,
            msg.sender
        );
        allGoalFunds.push(address(newGoalFund));
        userGoalFunds[msg.sender].push(address(newGoalFund));
        emit GoalFundCreated(msg.sender, address(newGoalFund));
    }

    function getGoalFunds() external view returns (address[] memory) {
        return allGoalFunds;
    }

    function getUserGoalFunds(address _user) external view returns (address[] memory) {
        return userGoalFunds[_user];
    }

    function getAllGoalFundsDetails() external view returns (GoalFundDetails[] memory) {
    GoalFundDetails[] memory details = new GoalFundDetails[](allGoalFunds.length);
    
    for (uint i = 0; i < allGoalFunds.length; i++) {
        GoalFund gf = GoalFund(payable(allGoalFunds[i]));
        (string memory name, , uint targetAmount, uint currentAmount, uint deadline, , , address payable beneficiary) = gf.goal();
        
        details[i] = GoalFundDetails(
            allGoalFunds[i],
            name,
            targetAmount,
            currentAmount,
            deadline,
            beneficiary,
            address(gf.token()),
            gf.fundType(),
            gf.platformFeePercentage()
        );
    }
    
    return details;
}

    function getGoalFundDetails(address _goalFund, bool all)
        external view returns (GoalFundDetails[] memory) {
        if (all) {
            GoalFundDetails[] memory details = new GoalFundDetails[](allGoalFunds.length);
            for (uint i = 0; i < allGoalFunds.length; i++) {
                GoalFund gf = GoalFund(payable(allGoalFunds[i]));
                (string memory name, , uint targetAmount, uint currentAmount, uint deadline, , , address payable beneficiary) = gf.goal();
                details[i] = GoalFundDetails(
                    allGoalFunds[i],
                    name,
                    targetAmount,
                    currentAmount,
                    deadline,
                    beneficiary,
                    address(gf.token()),
                    gf.fundType(),
                    gf.platformFeePercentage()
                );
            }
            return details;
        } else {
            GoalFund gf = GoalFund(payable(_goalFund));
            (string memory name, , uint targetAmount, uint currentAmount, uint deadline, , , address payable beneficiary) = gf.goal();
            GoalFundDetails[] memory details = new GoalFundDetails[](1);
            details[0] = GoalFundDetails(
                _goalFund,
                name,
                targetAmount,
                currentAmount,
                deadline,
                beneficiary,
                address(gf.token()),
                gf.fundType(),
                gf.platformFeePercentage()
            );
            return details;
        }
    }

    // New function to get details of a single GoalFund by address
    function getSingleGoalFundDetails(address _goalFund)
        external view returns (GoalFundDetails memory) {
        require(_goalFund != address(0), "Invalid GoalFund address");

        GoalFund gf = GoalFund(payable(_goalFund));
        (string memory name, , uint targetAmount, uint currentAmount, uint deadline, , , address payable beneficiary) = gf.goal();

        return GoalFundDetails(
            _goalFund,
            name,
            targetAmount,
            currentAmount,
            deadline,
            beneficiary,
            address(gf.token()),
            gf.fundType(),
            gf.platformFeePercentage()
        );
    }

    function emergencyWithdraw(address _tokenAddress) external onlyOwner nonReentrant {
        if (_tokenAddress == address(0)) {
            uint balance = address(this).balance;
            require(balance > 0, "No Ether to withdraw");
            (bool success, ) = owner().call{value: balance}("");
            require(success, "Ether withdrawal failed");
        } else {
            IERC20 token = IERC20(_tokenAddress);
            uint balance = token.balanceOf(address(this));
            require(balance > 0, "No tokens to withdraw");
            require(token.transfer(owner(), balance), "Token withdrawal failed");
        }
    }

    receive() external payable {}
}