# TimelockGovernor Technical Documentation

## Overview

The `TimelockGovernor` contract implements a time-delay mechanism for parameter changes in the YAP ecosystem. It ensures critical parameters can't be changed immediately, giving the community time to observe and react to pending changes. This contract extends OpenZeppelin's TimelockController with a fixed 24-hour delay.

## Inheritance

- **TimelockController**: Provides timelock functionality with proposers, executors, and admin roles

## Roles

The contract inherits the role system from TimelockController:

- **PROPOSER_ROLE**: Addresses that can propose actions
- **EXECUTOR_ROLE**: Addresses that can execute actions after the timelock period
- **ADMIN_ROLE**: Can manage roles (initially granted to the admin address, should be renounced)
- **TIMELOCK_ADMIN_ROLE**: Default admin role for the contract

## Functions

### Constructor

```solidity
constructor(
    address[] memory proposers,
    address[] memory executors,
    address admin
) TimelockController(
    24 hours,  // 24 hour timelock delay
    proposers,
    executors,
    admin
)
```

Initializes the contract with a 24-hour delay and sets up roles.

**Parameters:**
- `proposers`: Array of addresses that can propose actions
- `executors`: Array of addresses that can execute actions
- `admin`: Address that will be granted admin role

## Inherited Functions

The contract inherits all functionality from TimelockController, including:

#### schedule

```solidity
function schedule(
    address target,
    uint256 value,
    bytes calldata data,
    bytes32 predecessor,
    bytes32 salt,
    uint256 delay
) public virtual onlyRole(PROPOSER_ROLE) returns (bytes32 id)
```

Schedules an operation containing a single transaction.

**Parameters:**
- `target`: Address of the smart contract to call
- `value`: Native currency value to send
- `data`: Encoded function call data
- `predecessor`: Hash of a previous operation (0 if none)
- `salt`: Salt to prevent duplicate proposals
- `delay`: Amount of time to wait before execution (will be enforced as at least 24h)

**Returns:**
- `id`: Unique identifier of the scheduled operation

#### execute

```solidity
function execute(
    address target,
    uint256 value,
    bytes calldata data,
    bytes32 predecessor,
    bytes32 salt
) public payable virtual onlyRoleOrOpenRole(EXECUTOR_ROLE) returns (bytes memory)
```

Executes a previously scheduled operation.

**Parameters:**
- `target`: Address of the smart contract to call
- `value`: Native currency value to send
- `data`: Encoded function call data
- `predecessor`: Hash of a previous operation (0 if none)
- `salt`: Salt used when scheduling

**Returns:**
- Return data from the executed call

#### cancel

```solidity
function cancel(bytes32 id) public virtual onlyRole(PROPOSER_ROLE)
```

Cancels a scheduled operation.

**Parameters:**
- `id`: Identifier of the operation to cancel

## Governance Process

The TimelockGovernor enforces a governance process for critical parameter changes:

1. **Propose:** A proposer schedules a parameter change with the target contract address, function call, and parameters
2. **Wait:** The change enters a mandatory 24-hour waiting period
3. **Execute:** After the waiting period, an executor can execute the scheduled change
4. **Optional Cancel:** A proposer can cancel a scheduled operation before execution

## Security Considerations

1. **Role Management:** 
   - Proposers should be trusted entities (multisig wallets)
   - Executor role can be open to anyone, or restricted to specific addresses
   - Admin role should be renounced after initial setup

2. **Time Delay:** The 24-hour delay is hard-coded in the constructor, ensuring it cannot be bypassed or modified

3. **Transparency:** All scheduled operations are visible on-chain, providing transparency for parameter changes

## Integration with YAP Ecosystem

The TimelockGovernor is designed to control critical parameters in the YAP ecosystem:

1. YAP governance should transfer DEFAULT_ADMIN_ROLE of core contracts to the TimelockGovernor
2. Critical parameter changes should be proposed through TimelockGovernor:
   - DailyCompletion.setDailyReward()
   - DailyCompletion.setPointsPerYAP()
   - DailyCompletion.setDecayParams()
   - VestingBucket.setVestingParameters()
   - VestingBucket.setWhitelistedDestination()

## Usage Examples

### Setting up the TimelockGovernor

```javascript
// Define addresses
const proposers = ["0x123...abc"]; // Multisig wallet address
const executors = [ethers.constants.AddressZero]; // Anyone can execute (open role)
const admin = "0x456...def"; // Initial admin (should be renounced later)

// Deploy TimelockGovernor
const TimelockGovernor = await ethers.getContractFactory("TimelockGovernor");
const timelockGovernor = await TimelockGovernor.deploy(proposers, executors, admin);
await timelockGovernor.waitForDeployment();

// Transfer control to TimelockGovernor
await dailyCompletion.grantRole(await dailyCompletion.DEFAULT_ADMIN_ROLE(), timelockGovernor.address);
await vestingBucket.grantRole(await vestingBucket.DEFAULT_ADMIN_ROLE(), timelockGovernor.address);

// Renounce admin rights from deployer
await dailyCompletion.renounceRole(await dailyCompletion.DEFAULT_ADMIN_ROLE(), deployer.address);
await vestingBucket.renounceRole(await vestingBucket.DEFAULT_ADMIN_ROLE(), deployer.address);
```

### Proposing a Parameter Change

```javascript
// Get contract instance with proposer signer
const timelockGovernor = await ethers.getContractAt(
  "TimelockGovernor", 
  timelockGovernorAddress,
  proposerSigner
);

// Encode the function call to change daily reward to 0.5 YAP
const dailyCompletion = await ethers.getContractAt("DailyCompletion", dailyCompletionAddress);
const calldata = dailyCompletion.interface.encodeFunctionData(
  "setDailyReward", 
  [ethers.utils.parseEther("0.5")]
);

// Schedule the operation
const target = dailyCompletionAddress;
const value = 0; // No ETH sent
const predecessor = ethers.constants.HashZero; // No predecessor
const salt = ethers.utils.id("change-daily-reward-2025-05-11"); // Unique salt
const delay = 24 * 60 * 60; // 24 hours (will be enforced as minimum)

const txSchedule = await timelockGovernor.schedule(
  target,
  value,
  calldata,
  predecessor,
  salt,
  delay
);

// Get the operation ID
const operationId = ethers.utils.keccak256(
  ethers.utils.defaultAbiCoder.encode(
    ["address", "uint256", "bytes", "bytes32", "bytes32"],
    [target, value, calldata, predecessor, salt]
  )
);

console.log(`Operation scheduled with ID: ${operationId}`);
console.log(`Can be executed after: ${new Date(Date.now() + delay * 1000).toISOString()}`);
```

### Executing a Parameter Change

```javascript
// After 24 hours have passed, execute the change
// Can be called by anyone if executors is an open role
const txExecute = await timelockGovernor.execute(
  target,
  value,
  calldata,
  predecessor,
  salt
);

console.log(`Parameter change executed in tx: ${txExecute.hash}`);
```