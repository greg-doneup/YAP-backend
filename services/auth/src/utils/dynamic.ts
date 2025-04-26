import axios, { AxiosInstance } from 'axios';

const ENV_ID  = process.env.DYNAMIC_ENV_ID!;
const API_KEY = process.env.DYNAMIC_API_KEY!;
const BASE    = process.env.DYNAMIC_BASE ?? 'https://app.dynamic.xyz/api/v0';

export const dynamic: AxiosInstance = axios.create({
  baseURL: `${BASE}/sdk/${ENV_ID}`,
  headers: {
    'x-environment-id': ENV_ID,
    'x-api-key': API_KEY,
    'content-type': 'application/json'
  },
});

/** Step 1: begin email login, Dynamic sends magic link / OTP */
export async function initEmail(email: string) {
  const { data } = await dynamic.post('/users/email/init', { email });
  return data as { challengeId: string };
}

/** Step 2: verify OTP or magic-link, receive Dynamic user + JWT */
export async function verifyEmail(challengeId: string, otp: string) {
  const { data } = await dynamic.post('/users/email/verify', { challengeId, otp });
  return data as {
    jwt: string;
    user: { id: string };
  };
}

/** Step 3: create (or fetch) embedded wallet for the user */
export async function createEmbeddedWallet(userId: string) {
  const { data } = await dynamic.post(`/users/${userId}/embeddedWallets`, {
    chain: 'sei'     // or cosmos-chain ID as required
  });
  return data as { wallet: { address: string } };
}
