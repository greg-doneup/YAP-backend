declare module 'ethers' {
  // Export the main types from ethers v6
  export { Wallet } from 'ethers';
  export { HDNodeWallet } from 'ethers';
  export { TransactionRequest } from 'ethers';
  export { Signer } from 'ethers';
  export { JsonRpcProvider } from 'ethers';

  // Export utility functions
  export function getBytes(value: string): Uint8Array;
  export function hexlify(value: Uint8Array): string;
  export function toUtf8Bytes(value: string): Uint8Array;
  export function keccak256(value: string | Uint8Array): string;

  // No need for ethers namespace in v6 as these are direct exports
}