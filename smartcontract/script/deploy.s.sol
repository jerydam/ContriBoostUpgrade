// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/Nestora.sol";
import "../src/NestoraFactory.sol";
import "../src/savings.sol";
import "../src/savingsFactory.sol";
import "../src/billPayment.sol";

/// @notice Deploys the full stack: both factories, one sample instance of each
/// child contract (created through its factory, the way the dapp does it), and
/// the BillPayment gateway. The child constructor arguments are ABI-encoded and
/// written to `deployments/<chainid>.json` so `script/verify.sh` can verify
/// every contract.
///
/// Env vars:
///   PRIVATE_KEY    (required) deployer key
///   TOKEN_ADDRESS  (optional) ERC20 used by the samples and registered as a
///                  supported BillPayment token; unset => native/Ether samples
///   BILL_ADMIN     (optional) BillPayment admin + fulfiller; defaults to deployer
///   BILL_TREASURY  (optional) BillPayment treasury; defaults to deployer
contract DeployAll is Script {
    // Nestora sample configuration
    uint constant DAY_RANGE = 7;
    uint constant EXPECTED_NUMBER = 3;
    uint constant CONTRIBUTION_AMOUNT = 100 * 10 ** 18;
    uint constant HOST_FEE_PERCENTAGE = 200; // 2%
    uint constant PLATFORM_FEE_PERCENTAGE = 200; // 2%
    uint constant MAX_MISSED_DEPOSITS = 2;

    // Savings sample configuration
    uint constant TARGET_AMOUNT = 1000 * 10 ** 18;

    struct Addresses {
        address nestoraFactory;
        address savingsFactory;
        address nestora;
        address savings;
        address billPayment;
    }

    address deployer;
    address token;
    bool useErc20;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        deployer = vm.addr(deployerPrivateKey);

        // If TOKEN_ADDRESS is provided the samples use ERC20, otherwise the native coin.
        token = vm.envOr("TOKEN_ADDRESS", address(0));
        useErc20 = token != address(0);

        console.log("Deployer:", deployer);
        console.log("Chain id:", block.chainid);
        console.log("Payment method:", useErc20 ? "ERC20" : "Ether");

        vm.startBroadcast(deployerPrivateKey);

        // 1. NestoraFactory
        NestoraFactory nestoraFactory = new NestoraFactory();
        console.log("NestoraFactory:", address(nestoraFactory));

        // 2. SavingsFactory
        SavingsFactory savingsFactory = new SavingsFactory();
        console.log("SavingsFactory:", address(savingsFactory));

        // 3. Nestora, created through its factory
        bytes memory nestoraArgs = _createNestora(nestoraFactory);

        // 4. Savings, created through its factory
        bytes memory savingsArgs = _createSavings(savingsFactory);

        // 5. BillPayment gateway
        address billAdmin = vm.envOr("BILL_ADMIN", deployer);
        address billTreasury = vm.envOr("BILL_TREASURY", deployer);
        BillPayment billPayment = new BillPayment(billAdmin, billTreasury);
        console.log("BillPayment:", address(billPayment));
        console.log("  admin:", billAdmin);
        console.log("  treasury:", billTreasury);

        // Register the payment token so bills can be paid immediately.
        // Only possible while the deployer still holds DEFAULT_ADMIN_ROLE.
        if (useErc20 && billAdmin == deployer) {
            billPayment.setSupportedToken(token, true);
            console.log("  supported token:", token);
        }

        vm.stopBroadcast();

        address nestora = _last(nestoraFactory.getUserNestoras(deployer));
        address savings = _last(savingsFactory.getUserGoalFunds(deployer));
        console.log("Nestora:", nestora);
        console.log("Savings:", savings);

        Addresses memory addrs = Addresses({
            nestoraFactory: address(nestoraFactory),
            savingsFactory: address(savingsFactory),
            nestora: nestora,
            savings: savings,
            billPayment: address(billPayment)
        });
        _writeDeployment(addrs, nestoraArgs, savingsArgs, abi.encode(billAdmin, billTreasury));
    }

    /// @dev Creates the sample Nestora and returns its ABI-encoded constructor args.
    /// The factory forwards msg.sender as host and its own `platformOwner`
    /// (the deployer) as the fee recipient.
    function _createNestora(NestoraFactory factory) internal returns (bytes memory) {
        Nestora.Config memory config = Nestora.Config({
            dayRange: DAY_RANGE,
            expectedNumber: EXPECTED_NUMBER,
            contributionAmount: CONTRIBUTION_AMOUNT,
            hostFeePercentage: HOST_FEE_PERCENTAGE,
            platformFeePercentage: PLATFORM_FEE_PERCENTAGE,
            maxMissedDeposits: MAX_MISSED_DEPOSITS,
            startTimestamp: block.timestamp + 1 days,
            paymentMethod: useErc20 ? Nestora.PaymentMethod.ERC20 : Nestora.PaymentMethod.Ether
        });

        factory.createNestora(config, "Sample Nestora", "Sample Nestora pool", token);

        return abi.encode(config, "Sample Nestora", "Sample Nestora pool", token, deployer, deployer);
    }

    /// @dev Creates the sample Savings and returns its ABI-encoded constructor args.
    function _createSavings(SavingsFactory factory) internal returns (bytes memory) {
        uint deadline = block.timestamp + 30 days;

        factory.createSavings(
            "Sample Savings",
            "Sample savings goal",
            TARGET_AMOUNT,
            deadline,
            payable(deployer),
            useErc20 ? SavingsFactory.PaymentMethod.ERC20 : SavingsFactory.PaymentMethod.Ether,
            token,
            Savings.FundType.Group
        );

        return _encodeSavingsArgs(deadline, factory.platformFeePercentage());
    }

    /// @dev Split out of `_createSavings` to keep the 11-argument encode off the stack.
    function _encodeSavingsArgs(uint deadline, uint platformFee) internal view returns (bytes memory) {
        return abi.encode(
            "Sample Savings",
            "Sample savings goal",
            TARGET_AMOUNT,
            deadline,
            payable(deployer),
            useErc20 ? Savings.PaymentMethod.ERC20 : Savings.PaymentMethod.Ether,
            token,
            Savings.FundType.Group,
            platformFee,
            deployer,
            deployer
        );
    }

    /// @dev Writes addresses + ABI-encoded constructor args for script/verify.sh.
    function _writeDeployment(
        Addresses memory addrs,
        bytes memory nestoraArgs,
        bytes memory savingsArgs,
        bytes memory billArgs
    ) internal {
        string memory obj = "deployment";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "NestoraFactory", addrs.nestoraFactory);
        vm.serializeAddress(obj, "SavingsFactory", addrs.savingsFactory);
        vm.serializeAddress(obj, "Nestora", addrs.nestora);
        vm.serializeAddress(obj, "Savings", addrs.savings);
        vm.serializeAddress(obj, "BillPayment", addrs.billPayment);
        vm.serializeString(obj, "NestoraConstructorArgs", vm.toString(nestoraArgs));
        vm.serializeString(obj, "SavingsConstructorArgs", vm.toString(savingsArgs));
        string memory json = vm.serializeString(obj, "BillPaymentConstructorArgs", vm.toString(billArgs));

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console.log("Deployment written to:", path);
    }

    function _last(address[] memory list) internal pure returns (address) {
        require(list.length > 0, "no contract created");
        return list[list.length - 1];
    }
}

/// @notice Deploys only BillPayment and merges it into an existing
/// `deployments/<chainid>.json`, for chains where the factories are already live.
///
///   forge script script/deploy.s.sol:DeployBillPayment --rpc-url $RPC_URL --broadcast
contract DeployBillPayment is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address admin = vm.envOr("BILL_ADMIN", deployer);
        address treasury = vm.envOr("BILL_TREASURY", deployer);
        address token = vm.envOr("TOKEN_ADDRESS", address(0));

        vm.startBroadcast(deployerPrivateKey);

        BillPayment billPayment = new BillPayment(admin, treasury);
        console.log("BillPayment:", address(billPayment));
        console.log("  admin:", admin);
        console.log("  treasury:", treasury);

        if (token != address(0) && admin == deployer) {
            billPayment.setSupportedToken(token, true);
            console.log("  supported token:", token);
        }

        vm.stopBroadcast();

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(vm.toString(address(billPayment)), path, ".BillPayment");
        vm.writeJson(vm.toString(abi.encode(admin, treasury)), path, ".BillPaymentConstructorArgs");
        console.log("Deployment updated:", path);
    }
}
