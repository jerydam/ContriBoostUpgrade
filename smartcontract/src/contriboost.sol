// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../lib/openzeppelin-contracts/contracts/security/ReentrancyGuard.sol";
import "../lib/openzeppelin-contracts/contracts/utils/math/SafeMath.sol";
import "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
contract Contriboost is ReentrancyGuard, Ownable {
    using SafeMath for uint256;

    enum PaymentMethod {
        Ether,
        ERC20
    }

    struct Participant {
        uint id;
        uint depositAmount;
        uint lastDepositTime;
        bool exists;
        bool receivedFunds;
        bool active;
        uint missedDeposits;
    }

    struct Config {
        uint dayRange;
        uint expectedNumber;
        uint contributionAmount;
        uint hostFeePercentage;
        uint platformFeePercentage;
        uint maxMissedDeposits;
        uint startTimestamp;
        PaymentMethod paymentMethod;
    }

    string public name;
    string public description;
    address public host;
    uint public dayRange;
    uint public expectedNumber;
    uint public currentSegment;
    uint public contributionAmount;
    uint public hostFeePercentage;
    uint public platformFeePercentage;
    address public platformOwner;
    uint public constant PERCENTAGE_BASE = 10000;
    uint public maxMissedDeposits;
    uint public startTimestamp;
    PaymentMethod public paymentMethod;
    IERC20 public token;

    mapping(address => Participant) public participants;
    address[] public participantList;
    mapping(uint => mapping(address => bool)) public segmentParticipation;

    event Deposit(address indexed participant, uint amount, uint segment, PaymentMethod paymentMethod);
    event FundsTransferred(address indexed from, address indexed to, uint amount);
    event SegmentEnd(uint segmentNumber);
    event ParticipantJoined(address indexed participant, uint id);
    event ParticipantInactive(address indexed participant);
    event ParticipantReactivated(address indexed participant);
    event ParticipantAddedByHost(address indexed participant, uint id);
    event TokenAddressUpdated(address indexed oldToken, address indexed newToken);
    event PlatformFeeTransferred(address indexed platformOwner, uint amount);
    event ContriboostInitialized(address indexed host, address indexed platformOwner, address indexed owner);
    event ParticipantExited(address indexed participant, uint id);

    constructor(
        Config memory _config,
        string memory _name,
        string memory _description,
        address _tokenAddress,
        address _host,
        address _platformOwner
    ) Ownable() {
        require(_config.dayRange > 0, "Day range must be greater than zero");
        require(_config.expectedNumber > 0, "Expected number must be greater than zero");
        require(_config.contributionAmount > 0, "Contribution amount must be greater than zero");
        require(_config.startTimestamp > block.timestamp, "Start timestamp must be in future");
        require(_config.hostFeePercentage <= 500, "Host fee cannot exceed 5%");
        require(_config.platformFeePercentage <= 500, "Platform fee cannot exceed 5%");
        require(_platformOwner != address(0), "Invalid platform owner address");
        require(_host != address(0), "Invalid host address");

        host = _host;
        dayRange = _config.dayRange;
        expectedNumber = _config.expectedNumber;
        contributionAmount = _config.contributionAmount;
        currentSegment = 1;
        name = _name;
        description = _description;
        startTimestamp = _config.startTimestamp;
        paymentMethod = _config.paymentMethod;
        hostFeePercentage = _config.hostFeePercentage;
        platformFeePercentage = _config.platformFeePercentage;
        platformOwner = _platformOwner;
        maxMissedDeposits = _config.maxMissedDeposits;

        if (_config.paymentMethod == PaymentMethod.ERC20 && _tokenAddress != address(0)) {
            token = IERC20(_tokenAddress);
        } else if (_config.paymentMethod == PaymentMethod.Ether) {
            require(_tokenAddress == address(0), "Token address must be zero for Ether payment");
        } else {
            revert("Invalid payment method configuration");
        }

        emit ContriboostInitialized(_host, _platformOwner, owner());
    }

    modifier onlyHost() {
        require(msg.sender == host, "Only the host can call this function");
        _;
    }

    modifier onlyParticipant() {
        require(participants[msg.sender].exists, "You are not a participant");
        _;
    }

    modifier canJoin() {
        require(msg.sender != address(0), "Invalid participant address");
        require(!participants[msg.sender].exists, "You are already a participant");
        require(participantList.length < expectedNumber || block.timestamp >= startTimestamp, "Maximum participants reached or not yet started");
        _;
    }

    modifier depositAllowed() {
        require(block.timestamp >= startTimestamp, "Contributions have not started yet");
        require(msg.sender != address(0), "Address zero cannot participate");
        // Added requirements: segment must not be completed, and participant must not have deposited in this segment
        require(currentSegment <= expectedNumber, "All segments have been completed");
        require(!segmentParticipation[currentSegment][msg.sender], "Already participated in this segment");
        _;
    }

    function setTokenAddress(address _newTokenAddress) external onlyOwner {
        require(paymentMethod == PaymentMethod.ERC20, "Payment method must be ERC20");
        require(_newTokenAddress != address(0), "Token address cannot be zero");
        address oldToken = address(token);
        token = IERC20(_newTokenAddress);
        emit TokenAddressUpdated(oldToken, _newTokenAddress);
    }

    function setHostFeePercentage(uint _newFeePercentage) external onlyOwner {
        require(_newFeePercentage <= 500, "Host fee cannot exceed 5%");
        hostFeePercentage = _newFeePercentage;
    }

    function setDescription(string memory _newDescription) external onlyOwner {
        description = _newDescription;
    }

    function addParticipant(address _participant) external onlyHost {
        require(block.timestamp >= startTimestamp, "Cannot add participants before start time");
        require(!participants[_participant].exists, "Participant already exists");
        require(participantList.length < expectedNumber, "Maximum participants reached");

        Participant storage participant = participants[_participant];
        participant.id = participantList.length + 1;
        participant.exists = true;
        participant.active = true;
        participant.lastDepositTime = block.timestamp;
        participantList.push(_participant);

        emit ParticipantAddedByHost(_participant, participant.id);
    }

    function reactivateParticipantByHost(address _participant) external payable onlyHost nonReentrant {
        require(participants[_participant].exists, "Participant does not exist");
        Participant storage participant = participants[_participant];
        require(!participant.active, "Participant is already active");

        uint missedAmount = contributionAmount.mul(participant.missedDeposits);
        if (paymentMethod == PaymentMethod.ERC20) {
            require(msg.value == 0, "Ether not accepted for ERC20 payment");
            bool success = token.transferFrom(msg.sender, address(this), missedAmount);
            require(success, "Token transfer failed");
        } else {
            require(msg.value == missedAmount, "Incorrect Ether amount");
        }

        participant.depositAmount = participant.depositAmount.add(missedAmount);
        participant.lastDepositTime = block.timestamp;
        participant.active = true;
        participant.missedDeposits = 0;

        emit ParticipantReactivated(_participant);
    }

    function join() external canJoin nonReentrant {
        Participant storage participant = participants[msg.sender];
        participant.id = participantList.length + 1;
        participant.exists = true;
        participant.active = true;
        participant.lastDepositTime = block.timestamp;
        participantList.push(msg.sender);

        emit ParticipantJoined(msg.sender, participant.id);
    }

    function deposit() external payable onlyParticipant nonReentrant depositAllowed {
        Participant storage participant = participants[msg.sender];
        require(participant.active, "Your account is inactive due to missed deposits");

        if (paymentMethod == PaymentMethod.ERC20) {
            require(msg.value == 0, "Ether not accepted for ERC20 payment");
            bool success = token.transferFrom(msg.sender, address(this), contributionAmount);
            require(success, "Token transfer failed");
        } else {
            require(msg.value == contributionAmount, "Incorrect Ether amount");
        }

        participant.depositAmount = participant.depositAmount.add(contributionAmount);
        participant.lastDepositTime = block.timestamp;
        segmentParticipation[currentSegment][msg.sender] = true;

        emit Deposit(msg.sender, contributionAmount, currentSegment, paymentMethod);
    }

    function checkMissedDeposits() public {
        for (uint i = 0; i < participantList.length; i++) {
            address participantAddress = participantList[i];
            Participant storage participant = participants[participantAddress];
            if (participant.active && 
                block.timestamp > participant.lastDepositTime.add(dayRange * 1 days) && 
                !segmentParticipation[currentSegment][participantAddress]) {
                participant.missedDeposits = participant.missedDeposits.add(1);
                if (participant.missedDeposits >= maxMissedDeposits) {
                    participant.active = false;
                    emit ParticipantInactive(participantAddress);
                }
            }
        }
    }

    function exitContriboost() external onlyParticipant nonReentrant {
        require(block.timestamp < startTimestamp, "Cannot exit after Contriboost has started");
        Participant storage participant = participants[msg.sender];
        require(participant.depositAmount == 0, "Cannot exit with deposited funds");

        // Store participant ID for event
        uint participantId = participant.id;

        // Remove participant from mapping
        delete participants[msg.sender];

        // Remove participant from participantList
        for (uint i = 0; i < participantList.length; i++) {
            if (participantList[i] == msg.sender) {
                // Move last element to current index and pop the last element
                participantList[i] = participantList[participantList.length - 1];
                participantList.pop();
                break;
            }
        }

        emit ParticipantExited(msg.sender, participantId);
    }

    function reactivateParticipant() external payable onlyParticipant nonReentrant {
        Participant storage participant = participants[msg.sender];
        require(!participant.active, "Your account is already active");

        uint missedAmount = contributionAmount.mul(participant.missedDeposits);
        if (paymentMethod == PaymentMethod.ERC20) {
            require(msg.value == 0, "Ether not accepted for ERC20 payment");
            bool success = token.transferFrom(msg.sender, address(this), missedAmount);
            require(success, "Token transfer failed");
        } else {
            require(msg.value == missedAmount, "Incorrect Ether amount");
        }

        participant.depositAmount = participant.depositAmount.add(missedAmount);
        participant.lastDepositTime = block.timestamp;
        participant.active = true;
        participant.missedDeposits = 0;

        emit ParticipantReactivated(msg.sender);
    }

    function distributeFunds() external onlyHost nonReentrant {
        require(participantList.length == expectedNumber, "Expected number of participants not reached");
        require(currentSegment <= expectedNumber, "All segments have been completed");

        checkMissedDeposits();

        uint totalAmount = paymentMethod == PaymentMethod.Ether ? address(this).balance : token.balanceOf(address(this));
        require(totalAmount > 0, "No funds to distribute");

        uint hostFee = totalAmount.mul(hostFeePercentage).div(PERCENTAGE_BASE);
        uint platformFee = totalAmount.mul(platformFeePercentage).div(PERCENTAGE_BASE);
        uint recipientAmount = totalAmount.sub(hostFee).sub(platformFee);

        if (hostFee > 0) {
            if (paymentMethod == PaymentMethod.Ether) {
                (bool success, ) = host.call{value: hostFee}("");
                require(success, "Host fee transfer failed");
            } else {
                bool success = token.transfer(host, hostFee);
                require(success, "Host fee transfer failed");
            }
        }

        if (platformFee > 0) {
            if (paymentMethod == PaymentMethod.Ether) {
                (bool success, ) = platformOwner.call{value: platformFee}("");
                require(success, "Platform fee transfer failed");
            } else {
                bool success = token.transfer(platformOwner, platformFee);
                require(success, "Platform fee transfer failed");
            }
            emit PlatformFeeTransferred(platformOwner, platformFee);
        }

        address recipient = participantList[currentSegment - 1];
        require(participants[recipient].exists, "Invalid recipient");

        if (paymentMethod == PaymentMethod.Ether) {
            (bool success, ) = recipient.call{value: recipientAmount}("");
            require(success, "Recipient transfer failed");
        } else {
            bool success = token.transfer(recipient, recipientAmount);
            require(success, "Recipient transfer failed");
        }

        participants[recipient].receivedFunds = true;
        emit FundsTransferred(address(this), recipient, recipientAmount);

        currentSegment++;
        if (currentSegment > expectedNumber) {
            currentSegment = 1;
            emit SegmentEnd(expectedNumber);
        }
    }

    function getActiveParticipants() external view returns (address[] memory) {
        uint activeCount = 0;
        for (uint i = 0; i < participantList.length; i++) {
            if (participants[participantList[i]].active) {
                activeCount++;
            }
        }
        
        address[] memory activeParticipants = new address[](activeCount);
        uint index = 0;
        for (uint i = 0; i < participantList.length; i++) {
            if (participants[participantList[i]].active) {
                activeParticipants[index] = participantList[i];
                index++;
            }
        }
        return activeParticipants;
    }

    function getAllParticipants() external view returns (address[] memory) {
        return participantList;
    }

    function getParticipantStatus(address _participant) external view returns (
        uint id,
        uint depositAmount,
        uint lastDepositTime,
        bool exists,
        bool receivedFunds,
        bool active,
        uint missedDeposits
    ) {
        Participant memory p = participants[_participant];
        return (
            p.id,
            p.depositAmount,
            p.lastDepositTime,
            p.exists,
            p.receivedFunds,
            p.active,
            p.missedDeposits
        );
    }

    function emergencyWithdraw(address _tokenAddress) external onlyOwner nonReentrant {
        if (paymentMethod == PaymentMethod.Ether) {
            require(_tokenAddress == address(0), "Use address(0) for Ether withdrawal");
            uint balance = address(this).balance;
            require(balance > 0, "No Ether to withdraw");
            (bool success, ) = owner().call{value: balance}("");
            require(success, "Ether withdrawal failed");
        } else if (paymentMethod == PaymentMethod.ERC20) {
            require(_tokenAddress != address(0), "Invalid token address");
            IERC20 tokenToWithdraw = IERC20(_tokenAddress);
            uint balance = tokenToWithdraw.balanceOf(address(this));
            require(balance > 0, "No tokens to withdraw");
            bool success = tokenToWithdraw.transfer(owner(), balance);
            require(success, "Token withdrawal failed");
        } else {
            revert("Unsupported payment method");
        }
    }

    function getOwner() external view returns (address) {
        return owner();
    }

    receive() external payable {
        if (paymentMethod != PaymentMethod.Ether) {
            revert("Ether not accepted for this contract");
        }
    }
}