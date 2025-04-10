// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./contriboost.sol";
import "./goalFund.sol";
import "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../lib/openzeppelin-contracts/contracts/security/ReentrancyGuard.sol";

contract ContriboostFactory is ReentrancyGuard, Ownable {
    address[] public allContriboosts;
    address[] public allGoalFunds;
    mapping(address => address[]) public userContriboosts;
    mapping(address => address[]) public userGoalFunds;
    uint public platformFeePercentage = 200;
    address public platformOwner;

    event ContriboostCreated(address indexed host, address contriboostAddress);
    event GoalFundCreated(address indexed host, address goalFundAddress);

    struct ContriboostDetails {
        address contractAddress;
        string name;
        uint dayRange;
        uint expectedNumber;
        uint contributionAmount;
        address tokenAddress;
        uint hostFeePercentage;
        uint platformFeePercentage;
        uint maxMissedDeposits;
    }

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
    constructor() {
        platformOwner = msg.sender;
    }

    function createContriboost(
        uint _dayRange,
        uint _expectedNumber,
        uint _contributionAmount,
        string memory _name,
        string memory _description,
        address _tokenAddress,
        uint _hostFeePercentage,
        uint _maxMissedDeposits,
        uint _startTimestamp,
        Contriboost.PaymentMethod _paymentMethod
    ) external {
        require(_startTimestamp > block.timestamp, "Start timestamp must be in future");
        require(_hostFeePercentage <= 500, "Host fee cannot exceed 5%");

        Contriboost newContriboost = new Contriboost(
            _dayRange,
            _expectedNumber,
            _contributionAmount,
            _name,
            _description,
            _tokenAddress,
            _hostFeePercentage,
            platformFeePercentage,
            platformOwner,
            _maxMissedDeposits,
            _startTimestamp,
            _paymentMethod
        );

        allContriboosts.push(address(newContriboost));
        userContriboosts[msg.sender].push(address(newContriboost));
        emit ContriboostCreated(msg.sender, address(newContriboost));
    }

    function createGoalFund(
        string memory _name,
        string memory _description,
        uint _targetAmount,
        uint _deadline,
        address payable _beneficiary,
        Contriboost.PaymentMethod _paymentMethod,
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
            _paymentMethod,
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

    function getContriboosts() external view returns (address[] memory) {
        return allContriboosts;
    }

    function getUserContriboosts(address _user) external view returns (address[] memory) {
        return userContriboosts[_user];
    }

    function getContriboostDetails(address _contriboost) external view returns (ContriboostDetails memory) {
        Contriboost contriboost = Contriboost(payable(_contriboost));
        return ContriboostDetails(
            _contriboost,
            contriboost.name(),
            contriboost.dayRange(),
            contriboost.expectedNumber(),
            contriboost.contributionAmount(),
            address(contriboost.token()),
            contriboost.hostFeePercentage(),
            contriboost.platformFeePercentage(),
            contriboost.maxMissedDeposits()
        );
    }

    function getAllContriboostDetails() external view returns (ContriboostDetails[] memory) {
        ContriboostDetails[] memory details = new ContriboostDetails[](allContriboosts.length);
        for (uint i = 0; i < allContriboosts.length; i++) {
            Contriboost contriboost = Contriboost(payable(allContriboosts[i]));
            details[i] = ContriboostDetails(
                allContriboosts[i],
                contriboost.name(),
                contriboost.dayRange(),
                contriboost.expectedNumber(),
                contriboost.contributionAmount(),
                address(contriboost.token()),
                contriboost.hostFeePercentage(),
                contriboost.platformFeePercentage(),
                contriboost.maxMissedDeposits()
            );
        }
        return details;
    }

    function getGoalFunds() external view returns (address[] memory) {
        return allGoalFunds;
    }

    function getUserGoalFunds(address _user) external view returns (address[] memory) {
        return userGoalFunds[_user];
    }

  function getGoalFundDetails(address _goalFund) external view returns (GoalFundDetails memory) {
        GoalFund gf = GoalFund(payable(_goalFund));
        
        // Explicitly unpack the Goal struct from gf.goal()
        (
            string memory name,
            string memory description, // Not used in GoalFundDetails, but must be captured
            uint targetAmount,
            uint currentAmount,
            uint deadline,
            bool achieved,            // Not used in GoalFundDetails
            bool fundsWithdrawn,      // Not used in GoalFundDetails
            address payable beneficiary
        ) = gf.goal();

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

    function getAllGoalFundDetails() external view returns (GoalFundDetails[] memory) {
        GoalFundDetails[] memory details = new GoalFundDetails[](allGoalFunds.length);
        for (uint i = 0; i < allGoalFunds.length; i++) {
            GoalFund gf = GoalFund(payable(allGoalFunds[i]));
            (
                string memory name,
                string memory description,
                uint targetAmount,
                uint currentAmount,
                uint deadline,
                bool achieved,
                bool fundsWithdrawn,
                address payable beneficiary
            ) = gf.goal();

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

    function emergencyWithdraw(address _tokenAddress) external onlyOwner nonReentrant {
        if (_tokenAddress == address(0)) {
            uint balance = address(this).balance;
            require(balance > 0, "No Ether to withdraw");
            (bool success, ) = owner().call{value: balance}("");
            require(success, "Ether withdrawal failed");
        } else {
            IERC20 tokenToWithdraw = IERC20(_tokenAddress);
            uint balance = tokenToWithdraw.balanceOf(address(this));
            require(balance > 0, "No tokens to withdraw");
            bool success = tokenToWithdraw.transfer(owner(), balance);
            require(success, "Token withdrawal failed");
        }
    }

    receive() external payable {}
}   