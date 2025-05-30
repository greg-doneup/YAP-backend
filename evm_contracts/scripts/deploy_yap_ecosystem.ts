// scripts/deploy_yap_ecosystem.ts
import { ethers } from "hardhat";

async function main() {
  console.log("Starting YAP ecosystem deployment...");
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);

  // Step 1: Deploy YAPToken
  console.log("\n1. Deploying YAPToken...");
  const YAPToken = await ethers.getContractFactory("YAPToken");
  const yapToken = await YAPToken.deploy();
  await yapToken.waitForDeployment();
  console.log(`YAPToken deployed at: ${await yapToken.getAddress()}`);

  // Step 2: Deploy VestingBucket
  console.log("\n2. Deploying VestingBucket...");
  const VestingBucket = await ethers.getContractFactory("VestingBucket");
  const vestingBucket = await VestingBucket.deploy(await yapToken.getAddress());
  await vestingBucket.waitForDeployment();
  console.log(`VestingBucket deployed at: ${await vestingBucket.getAddress()}`);

  // Step 3: Connect YAPToken to VestingBucket
  console.log("\n3. Connecting YAPToken to VestingBucket...");
  await yapToken.setVestingBucket(await vestingBucket.getAddress());
  console.log("VestingBucket set in YAPToken");

  // Step 4: Deploy DailyCompletion
  console.log("\n4. Deploying DailyCompletion...");
  const DailyCompletion = await ethers.getContractFactory("DailyCompletion");
  const dailyCompletion = await DailyCompletion.deploy(
    await yapToken.getAddress(),
    await vestingBucket.getAddress()
  );
  await dailyCompletion.waitForDeployment();
  console.log(`DailyCompletion deployed at: ${await dailyCompletion.getAddress()}`);

  // Step 5: Deploy BurnRedeemer
  console.log("\n5. Deploying BurnRedeemer...");
  const treasuryAddress = deployer.address; // Replace with actual treasury address in production
  const BurnRedeemer = await ethers.getContractFactory("BurnRedeemer");
  const burnRedeemer = await BurnRedeemer.deploy(
    await yapToken.getAddress(),
    treasuryAddress
  );
  await burnRedeemer.waitForDeployment();
  console.log(`BurnRedeemer deployed at: ${await burnRedeemer.getAddress()}`);

  // Step 6: Deploy TimelockGovernor
  console.log("\n6. Deploying TimelockGovernor...");
  const proposers = [deployer.address]; // In production, this should be a multisig
  const executors = [deployer.address]; // In production, this should be a multisig
  const adminAddress = deployer.address; // In production, this should be a multisig
  
  const TimelockGovernor = await ethers.getContractFactory("TimelockGovernor");
  const timelockGovernor = await TimelockGovernor.deploy(
    proposers,
    executors,
    adminAddress
  );
  await timelockGovernor.waitForDeployment();
  console.log(`TimelockGovernor deployed at: ${await timelockGovernor.getAddress()}`);

  // Step 7: Role wiring
  console.log("\n7. Setting up roles and permissions...");
  
  // Grant MINTER_ROLE to DailyCompletion
  const MINTER_ROLE = await yapToken.MINTER_ROLE();
  await yapToken.grantRole(MINTER_ROLE, await dailyCompletion.getAddress());
  console.log("MINTER_ROLE granted to DailyCompletion");
  
  // Grant ALLOCATOR_ROLE to DailyCompletion
  const ALLOCATOR_ROLE = await vestingBucket.ALLOCATOR_ROLE();
  await vestingBucket.grantRole(ALLOCATOR_ROLE, await dailyCompletion.getAddress());
  console.log("ALLOCATOR_ROLE granted to DailyCompletion");
  
  // Grant BURNER_ROLE to BurnRedeemer
  const BURNER_ROLE = await yapToken.BURNER_ROLE();
  await yapToken.grantRole(BURNER_ROLE, await burnRedeemer.getAddress());
  console.log("BURNER_ROLE granted to BurnRedeemer");
  
  // Set BurnRedeemer as a whitelisted destination in VestingBucket
  await vestingBucket.setWhitelistedDestination(await burnRedeemer.getAddress(), true);
  console.log("BurnRedeemer whitelisted in VestingBucket");

  // Step 8: Save deployment information
  console.log("\n8. Saving deployment information...");
  
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    timestamp: new Date().toISOString(),
    yapToken: await yapToken.getAddress(),
    vestingBucket: await vestingBucket.getAddress(),
    dailyCompletion: await dailyCompletion.getAddress(),
    burnRedeemer: await burnRedeemer.getAddress(),
    timelockGovernor: await timelockGovernor.getAddress(),
    deployer: deployer.address,
  };

  console.log("Deployment complete! Deployment information:");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  console.log("\nNext steps for secure setup:");
  console.log("1. Renounce MINTER_ROLE from deployer in YAPToken");
  console.log("2. Transfer DEFAULT_ADMIN_ROLE to a multisig address");
  console.log("3. Transfer PAUSER_ROLE to a multisig address");
  console.log("4. Verify contracts on block explorer");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });