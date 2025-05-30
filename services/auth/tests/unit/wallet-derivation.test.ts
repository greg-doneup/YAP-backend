import { createEmbeddedWallet, regenerateEthWallet } from '../../src/utils/auth-utils';
import { Wallet } from 'ethers';

describe('Wallet Derivation Tests', () => {
  describe('createEmbeddedWallet', () => {
    it('should generate deterministic wallets for the same userId', async () => {
      const userId = 'test-user-123';
      const wallet1 = await createEmbeddedWallet(userId);
      const wallet2 = await createEmbeddedWallet(userId);
      
      expect(wallet1.wallet.address).toBe(wallet2.wallet.address);
      expect(wallet1.ethWallet?.address).toBe(wallet2.ethWallet?.address);
    });
    
    it('should validate provided wallet addresses', async () => {
      const userId = 'test-user-456';
      const initialWallet = await createEmbeddedWallet(userId);
      
      // Should succeed with matching addresses
      const validWallet = await createEmbeddedWallet(
        userId,
        initialWallet.wallet.address,
        initialWallet.ethWallet?.address
      );
      
      expect(validWallet.wallet.address).toBe(initialWallet.wallet.address);
      expect(validWallet.ethWallet?.address).toBe(initialWallet.ethWallet?.address);
      
      // Should throw with mismatched addresses
      await expect(
        createEmbeddedWallet(
          userId,
          'sei1invalid'
        )
      ).rejects.toThrow('Provided SEI address does not match derived wallet');
    });
  });
  
  describe('regenerateEthWallet', () => {
    it('should regenerate the same Ethereum wallet given the same SEI address and timestamp', async () => {
      const seiAddress = 'sei1test123';
      const timestamp = 1234567890;
      
      const wallet1 = await regenerateEthWallet(seiAddress, timestamp);
      const wallet2 = await regenerateEthWallet(seiAddress, timestamp);
      
      expect(wallet1.address).toBe(wallet2.address);
    });
    
    it('should generate different wallets for different SEI addresses or timestamps', async () => {
      const seiAddress1 = 'sei1test123';
      const seiAddress2 = 'sei1test456';
      const timestamp = 1234567890;
      
      const wallet1 = await regenerateEthWallet(seiAddress1, timestamp);
      const wallet2 = await regenerateEthWallet(seiAddress2, timestamp);
      const wallet3 = await regenerateEthWallet(seiAddress1, timestamp + 1);
      
      expect(wallet1.address).not.toBe(wallet2.address);
      expect(wallet1.address).not.toBe(wallet3.address);
      expect(wallet2.address).not.toBe(wallet3.address);
    });
  });
});
