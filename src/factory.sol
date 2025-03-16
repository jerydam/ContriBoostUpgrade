// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./contriboost.sol";
import "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../lib/openzeppelin-contracts/contracts/security/ReentrancyGuard.sol";

contract ContriboostFactory is ReentrancyGuard, Ownable {
    address[] public allContriboosts;
    mapping(address => address[]) public userContriboosts;
    event ContriboostCreated(address indexed host, address contriboostAddress);
    
    struct ContriboostDetails {
        address contractAddress;
        string name;
        uint dayRange;
        uint expectedNumber;
        uint contributionAmount;
        address tokenAddress;
        uint hostFeePercentage;
        uint maxMissedDeposits;
    }

    constructor() Ownable() {} // Updated constructor syntax for newer Ownable versions

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

        Contriboost newContriboost = new Contriboost(
            _dayRange,
            _expectedNumber,
            _contributionAmount,
            _name,
            _description,
            _tokenAddress,
            _hostFeePercentage,
            _maxMissedDeposits,
            _startTimestamp,
            _paymentMethod
        );

        allContriboosts.push(address(newContriboost));
        userContriboosts[msg.sender].push(address(newContriboost));

        emit ContriboostCreated(msg.sender, address(newContriboost));
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
                contriboost.maxMissedDeposits()
            );
        }
        return details;
    }

    function emergencyWithdraw(address _tokenAddress) external onlyOwner nonReentrant {
        if (_tokenAddress == address(0)) {
            // Ether withdrawal
            uint balance = address(this).balance;
            require(balance > 0, "No Ether to withdraw");
            
            (bool success, ) = owner().call{value: balance}("");
            require(success, "Ether withdrawal failed");
        } else {
            // ERC20 withdrawal
            require(_tokenAddress != address(0), "Invalid token address"); // Redundant but kept for clarity
            IERC20 tokenToWithdraw = IERC20(_tokenAddress);
            uint balance = tokenToWithdraw.balanceOf(address(this));
            require(balance > 0, "No tokens to withdraw");
            
            bool success = tokenToWithdraw.transfer(owner(), balance);
            require(success, "Token withdrawal failed");
        }
    }

    // Allow the factory to receive Ether
    receive() external payable {}
}