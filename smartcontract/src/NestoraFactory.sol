// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "../lib/openzeppelin-contracts/contracts/security/ReentrancyGuard.sol";
import "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import "./Nestora.sol";

contract NestoraFactory is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    address[] public allNestoras;
    mapping(address => address[]) public userNestoras;
    uint public platformFeePercentage = 200; // Fixed at 2%
    address public platformOwner;

    event NestoraCreated(address indexed host, address NestoraAddress);

    struct NestoraDetails {
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

    constructor() {
        platformOwner = msg.sender;
    }

    function createNestora(
        Nestora.Config memory _config,
        string memory _name,
        string memory _description,
        address _tokenAddress
    ) external {
        require(_config.startTimestamp > block.timestamp, "Start timestamp must be in future");
        require(_config.hostFeePercentage <= 500, "Host fee cannot exceed 5%");

        Nestora newNestora = new Nestora(
            _config,
            _name,
            _description,
            _tokenAddress,
            platformOwner,
            msg.sender
        );
        allNestoras.push(address(newNestora));
        userNestoras[msg.sender].push(address(newNestora));
        emit NestoraCreated(msg.sender, address(newNestora));
    }

    function getNestoras() external view returns (address[] memory) {
        return allNestoras;
    }

    function getUserNestoras(address _user) external view returns (address[] memory) {
        return userNestoras[_user];
    }

    function getAllNestorasDetails() external view returns (NestoraDetails[] memory) {
    NestoraDetails[] memory details = new NestoraDetails[](allNestoras.length);
    
    for (uint i = 0; i < allNestoras.length; i++) {
        Nestora Nestora = Nestora(payable(allNestoras[i]));
        details[i] = NestoraDetails(
            allNestoras[i],
            Nestora.name(),
            Nestora.dayRange(),
            Nestora.expectedNumber(),
            Nestora.contributionAmount(),
            address(Nestora.token()),
            Nestora.hostFeePercentage(),
            Nestora.platformFeePercentage(),
            Nestora.maxMissedDeposits()
        );
    }
    
    return details;
}

    function getNestoraDetails(address _Nestora, bool all)
        external view returns (NestoraDetails[] memory) {
        if (all) {
            NestoraDetails[] memory details = new NestoraDetails[](allNestoras.length);
            for (uint i = 0; i < allNestoras.length; i++) {
                Nestora Nestora = Nestora(payable(allNestoras[i]));
                details[i] = NestoraDetails(
                    allNestoras[i],
                    Nestora.name(),
                    Nestora.dayRange(),
                    Nestora.expectedNumber(),
                    Nestora.contributionAmount(),
                    address(Nestora.token()),
                    Nestora.hostFeePercentage(),
                    Nestora.platformFeePercentage(),
                    Nestora.maxMissedDeposits()
                );
            }
            return details;
        } else {
            Nestora Nestora = Nestora(payable(_Nestora));
            NestoraDetails[] memory details = new NestoraDetails[](1);
            details[0] = NestoraDetails(
                _Nestora,
                Nestora.name(),
                Nestora.dayRange(),
                Nestora.expectedNumber(),
                Nestora.contributionAmount(),
                address(Nestora.token()),
                Nestora.hostFeePercentage(),
                Nestora.platformFeePercentage(),
                Nestora.maxMissedDeposits()
            );
            return details;
        }
    }

    // New function to get details of a single Nestora
    function getSingleNestoraDetails(address _Nestora)
        external view returns (NestoraDetails memory) {
        require(_Nestora != address(0), "Invalid Nestora address");
        Nestora Nestora = Nestora(payable(_Nestora));
        return NestoraDetails(
            _Nestora,
            Nestora.name(),
            Nestora.dayRange(),
            Nestora.expectedNumber(),
            Nestora.contributionAmount(),
            address(Nestora.token()),
            Nestora.hostFeePercentage(),
            Nestora.platformFeePercentage(),
            Nestora.maxMissedDeposits()
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