import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { Decimal } from "@cosmjs/math";

const RPC = process.env.SEI_RPC!;
const MNEMONIC = process.env.REWARD_TREASURY_MNEMONIC!;
const GAS = "0.15";   // Sei gas price

// Interface to store client and account information together
interface ClientContext {
  client: SigningCosmWasmClient;
  address: string;
}

export async function getClient(): Promise<ClientContext> {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, { prefix: "sei" });
  const [account] = await wallet.getAccounts();
  const client = await SigningCosmWasmClient.connectWithSigner(RPC, wallet, {
    gasPrice: { denom: "usei", amount: Decimal.fromUserInput(GAS, 18) }
  });
  
  return {
    client,
    address: account.address
  };
}

export async function reward(
  userAddr: string,
  completionContract: string,
) {
  const { client, address } = await getClient();
  const res = await client.execute(
    address,
    completionContract,
    { complete: { learner: userAddr } },
    "auto"
  );
  return res.transactionHash;
}
