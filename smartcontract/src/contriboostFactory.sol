// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;
import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../lib/openzeppelin-contracts/contracts/security/ReentrancyGuard.sol";
import "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import "./contriboost.sol"; 
contract ContriboostFactory is ReentrancyGuard, Ownable {
    address[] public allContriboosts;
    mapping(address => address[]) public userContriboosts;
    uint public platformFeePercentage = 200; // Fixed at 2%
    address public platformOwner;

    event ContriboostCreated(address indexed host, address contriboostAddress);
    event DebugContriboostCreation(address indexed host, address indexed platformOwner, address contriboostAddress);

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

    struct ContriboostTestDetails {
        address contractAddress;
        address host;
        address owner;
    }

    constructor() Ownable() {
        platformOwner = msg.sender;
    }

    function createContriboost(
        Contriboost.Config memory _config,
        string memory _name,
        string memory _description,
        address _tokenAddress
    ) external {
        require(_config.startTimestamp > block.timestamp, "Start timestamp must be in future");
        require(_config.hostFeePercentage <= 500, "Host fee cannot exceed 5%");

        Contriboost newContriboost = new Contriboost(
            _config,
            _name,
            _description,
            _tokenAddress,
            msg.sender, // Pass the host (caller of createContriboost)
            platformOwner // Pass the platform owner (factory deployer)
        );
        address contriboostAddress = address(newContriboost);
        allContriboosts.push(contriboostAddress);
        userContriboosts[msg.sender].push(contriboostAddress);
        emit ContriboostCreated(msg.sender, contriboostAddress);
        emit DebugContriboostCreation(msg.sender, platformOwner, contriboostAddress);
    }

    function getContriboostTestDetails(address _contriboost) external view returns (ContriboostTestDetails memory) {
        require(_contriboost != address(0), "Invalid Contriboost address");
        Contriboost contriboost = Contriboost(payable(_contriboost));
        return ContriboostTestDetails(
            _contriboost,
            contriboost.host(),
            contriboost.getOwner()
        );
    }

    function getContriboosts() external view returns (address[] memory) {
        return allContriboosts;
    }

    function getUserContriboosts(address _user) external view returns (address[] memory) {
        return userContriboosts[_user];
    }

    function getAllContriboostsDetails() external view returns (ContriboostDetails[] memory) {
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

    function getContriboostDetails(address _contriboost, bool all)
        external view returns (ContriboostDetails[] memory) {
        if (all) {
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
        } else {
            Contriboost contriboost = Contriboost(payable(_contriboost));
            ContriboostDetails[] memory details = new ContriboostDetails[](1);
            details[0] = ContriboostDetails(
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
            return details;
        }
    }

    function getSingleContriboostDetails(address _contriboost)
        external view returns (ContriboostDetails memory) {
        require(_contriboost != address(0), "Invalid Contriboost address");
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

    function getPlatformOwner() external view returns (address) {
        return platformOwner;
    }

    receive() external payable {}
}