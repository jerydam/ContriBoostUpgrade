// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/factory.sol";
import "../src/contriboost.sol";
import {MockERC20} from "../test/contriboost.t.sol"; // Assuming this is in test directory;

contract DeployContriboost is Script {
    // Configuration variables (adjust as needed)
    uint constant DAY_RANGE = 7;
    uint constant EXPECTED_NUMBER = 3;
    uint constant CONTRIBUTION_AMOUNT = 100 * 10**18;
    uint constant HOST_FEE_PERCENTAGE = 200; // 2%
    uint constant MAX_MISSED_DEPOSITS = 2;

    function run() external {
        // Load private key from environment or use default for local testing
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        if (deployerPrivateKey == 0) {
            // Default private key for Anvil (first account: 0xac0974...)
            deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        }

        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);

        // Deployer address
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deploying contracts from:", deployer);

        // Deploy MockERC20 (optional, for testing)
        MockERC20 token = new MockERC20();
        console.log("MockERC20 deployed at:", address(token));

        // Deploy ContriboostFactory
        ContriboostFactory factory = new ContriboostFactory();
        console.log("ContriboostFactory deployed at:", address(factory));

        // Deploy a sample Contriboost instance via factory (ERC20)
        uint startTimestamp = block.timestamp + 1 days;
        factory.createContriboost(
            DAY_RANGE,
            EXPECTED_NUMBER,
            CONTRIBUTION_AMOUNT,
            "Sample ERC20 Contriboost",
            "A test Contriboost with ERC20",
            address(token),
            HOST_FEE_PERCENTAGE,
            MAX_MISSED_DEPOSITS,
            startTimestamp,
            Contriboost.PaymentMethod.ERC20
        );
        address[] memory userContriboosts = factory.getUserContriboosts(deployer);
        address erc20Contriboost = userContriboosts[0];
        console.log("ERC20 Contriboost deployed at:", erc20Contriboost);

        // Deploy a sample Contriboost instance via factory (Ether)
        factory.createContriboost(
            DAY_RANGE,
            EXPECTED_NUMBER,
            CONTRIBUTION_AMOUNT,
            "Sample Ether Contriboost",
            "A test Contriboost with Ether",
            address(0),
            HOST_FEE_PERCENTAGE,
            MAX_MISSED_DEPOSITS,
            startTimestamp,
            Contriboost.PaymentMethod.Ether
        );
        userContriboosts = factory.getUserContriboosts(deployer);
        address etherContriboost = userContriboosts[1];
        console.log("Ether Contriboost deployed at:", etherContriboost);

        // Stop broadcasting
        vm.stopBroadcast();

        // Log final deployment summary
        console.log("Deployment completed!");
        console.log("Factory address:", address(factory));
        console.log("ERC20 Contriboost address:", erc20Contriboost);
        console.log("Ether Contriboost address:", etherContriboost);
        console.log("MockERC20 address:", address(token));
    }
}