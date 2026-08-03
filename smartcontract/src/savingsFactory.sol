// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../lib/openzeppelin-contracts/contracts/security/ReentrancyGuard.sol";
import "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "./savings.sol";


contract SavingsFactory is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    address[] public allSavings;
    mapping(address => address[]) public userSavings;
    uint public platformFeePercentage = 200; // Fixed at 2%
    address public platformOwner;

    event SavingsCreated(address indexed host, address savingsAddress);

    enum PaymentMethod { Ether, ERC20 }

    struct SavingsDetails {
        address contractAddress;
        string name;
        uint targetAmount;
        uint currentAmount;
        uint deadline;
        address beneficiary;
        address tokenAddress;
        Savings.FundType fundType;
        uint platformFeePercentage;
    }

    constructor() Ownable() {
        platformOwner = msg.sender;
    }

    function createSavings(
        string memory _name,
        string memory _description,
        uint _targetAmount,
        uint _deadline,
        address payable _beneficiary,
        PaymentMethod _paymentMethod,
        address _tokenAddress,
        Savings.FundType _fundType
    ) external {
        require(_deadline > block.timestamp, "Deadline must be in future");

        Savings newSavings = new Savings(
            _name,
            _description,
            _targetAmount,
            _deadline,
            _beneficiary,
            Savings .PaymentMethod(uint(_paymentMethod)),
            _tokenAddress,
            _fundType,
            platformFeePercentage,
            platformOwner,
            msg.sender
        );
        allSavings.push(address(newSavings));
        userSavings[msg.sender].push(address(newSavings));
        emit SavingsCreated(msg.sender, address(newSavings));
    }

    function getGoalFunds() external view returns (address[] memory) {
        return allSavings;
    }

    function getUserGoalFunds(address _user) external view returns (address[] memory) {
        return userSavings[_user];
    }

    function getAllSavingsDetails() external view returns (SavingsDetails[] memory) {
    SavingsDetails[] memory details = new SavingsDetails[](allSavings.length);
    
    for (uint i = 0; i < allSavings.length; i++) {
        Savings s = Savings(payable(allSavings[i]));
        (string memory name, , uint targetAmount, uint currentAmount, uint deadline, , , address payable beneficiary) = s.goal();
        
        details[i] = SavingsDetails(
            allSavings[i],
            name,
            targetAmount,
            currentAmount,
            deadline,
            beneficiary,
            address(s.token()),
            s.fundType(),
            s.platformFeePercentage()
        );
    }
    
    return details;
}

    function getSavingsDetails(address _savings, bool all)
        external view returns (SavingsDetails[] memory) {
        if (all) {
            SavingsDetails[] memory details = new SavingsDetails[](allSavings.length);
            for (uint i = 0; i < allSavings.length; i++) {
                Savings s = Savings(payable(allSavings[i]));
                (string memory name, , uint targetAmount, uint currentAmount, uint deadline, , , address payable beneficiary) = s.goal();
                details[i] = SavingsDetails(
                    allSavings[i],
                    name,
                    targetAmount,
                    currentAmount,
                    deadline,
                    beneficiary,
                    address(s.token()),
                    s.fundType(),
                    s.platformFeePercentage()
                );
            }
            return details;
        } else {
            Savings s = Savings(payable(_savings));
            (string memory name, , uint targetAmount, uint currentAmount, uint deadline, , , address payable beneficiary) = s.goal();
            SavingsDetails[] memory details = new SavingsDetails[](1);
            details[0] = SavingsDetails(
                _savings,
                name,
                targetAmount,
                currentAmount,
                deadline,
                beneficiary,
                address(s.token()),
                s.fundType(),
                s.platformFeePercentage()
            );
            return details;
        }
    }

    // New function to get details of a single GoalFund by address
    function getSingleSavingsDetails(address _savings)
        external view returns (SavingsDetails memory) {
        require(_savings != address(0), "Invalid Savings address");

        Savings s = Savings(payable(_savings));
        (string memory name, , uint targetAmount, uint currentAmount, uint deadline, , , address payable beneficiary) = s.goal();

        return SavingsDetails(
            _savings,
            name,
            targetAmount,
            currentAmount,
            deadline,
            beneficiary,
            address(s.token()),
            s.fundType(),
            s.platformFeePercentage()
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
            token.safeTransfer(owner(), balance);
        }
    }

    receive() external payable {}
}