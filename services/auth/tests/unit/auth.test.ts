import { createEmbeddedWallet } from '../../src/utils/auth-utils';

describe('Auth Utilities', () => {
  describe('createEmbeddedWallet', () => {
    it('should create a wallet when no address is provided', async () => {
      const userId = 'test-user-123';
      
      const result = await createEmbeddedWallet(userId);
      
      expect(result).toBeDefined();
      expect(result.wallet).toBeDefined();
      expect(result.wallet.address).toBeDefined();
      expect(result.wallet.address.startsWith('sei1')).toBe(true);
      
      expect(result.ethWallet).toBeDefined();
      expect(result.ethWallet!.address).toBeDefined();
      expect(result.ethWallet!.address.startsWith('0x')).toBe(true);
    });
    
    it('should validate provided wallet addresses', async () => {
      // First create a wallet to get valid addresses
      const userId = 'test-user-456';
      const initialResult = await createEmbeddedWallet(userId);
      
      // Now try to create it again with the same addresses
      const result = await createEmbeddedWallet(
        userId,
        initialResult.wallet.address,
        initialResult.ethWallet!.address
      );
      
      // Should match exactly
      expect(result.wallet.address).toBe(initialResult.wallet.address);
      expect(result.ethWallet!.address).toBe(initialResult.ethWallet!.address);
      
      // Should throw with mismatched addresses
      await expect(
        createEmbeddedWallet(
          userId,
          'sei1invalidaddress',
          '0xinvalidaddress'
        )
      ).rejects.toThrow('Provided SEI address does not match derived wallet');
    });
    
    it('should generate deterministic addresses for the same user', async () => {
      const userId = 'test-user-789';
      
      const result1 = await createEmbeddedWallet(userId);
      const result2 = await createEmbeddedWallet(userId);
      
      // When no custom wallet is provided, we should get deterministic addresses
      expect(result1.wallet.address).toBe(result2.wallet.address);
      expect(result1.ethWallet!.address).toBe(result2.ethWallet!.address);
    });
  });
});