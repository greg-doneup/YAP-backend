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
    
    it('should use provided wallet addresses', async () => {
      const userId = 'test-user-456';
      const seiWalletAddress = 'sei1customwallet123';
      const ethWalletAddress = '0xcustomethwallet456';
      
      const result = await createEmbeddedWallet(userId, seiWalletAddress, ethWalletAddress);
      
      expect(result.wallet.address).toBe(seiWalletAddress);
      expect(result.ethWallet!.address).toBe(ethWalletAddress);
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