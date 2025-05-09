/// <reference types="jest" />
import jwt from 'jsonwebtoken';
import express from 'express';
import { requireAuth, AuthErrorType, getUserIdFromRequest, getWalletAddressesFromRequest } from './authMiddleware';

// Using Request and Response types from the express namespace
type Request = express.Request;
type Response = express.Response;

describe('Auth Middleware', () => {
  const SECRET = 'test-secret';
  const MOCK_USER_ID = 'user-123';
  const MOCK_SEI_WALLET = 'sei1mock123wallet456address789';
  const MOCK_ETH_WALLET = '0xMockEthWalletAddress';
  
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  const nextFunction = jest.fn();
  
  beforeEach(() => {
    mockRequest = {
      headers: {}
    };
    
    // Properly type the mock response methods to satisfy TypeScript
    mockResponse = {
      status: jest.fn().mockReturnThis() as unknown as Response['status'],
      json: jest.fn().mockReturnThis() as unknown as Response['json'],
      sendStatus: jest.fn().mockReturnThis() as unknown as Response['sendStatus']
    };
    
    nextFunction.mockClear();
  });
  
  describe('requireAuth middleware', () => {
    it('should pass valid access token', () => {
      // Create a valid access token
      const token = jwt.sign({ 
        sub: MOCK_USER_ID, 
        walletAddress: MOCK_SEI_WALLET,
        ethWalletAddress: MOCK_ETH_WALLET,
        type: 'access' 
      }, SECRET);
      
      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };
      
      // Call the middleware
      requireAuth(SECRET)(mockRequest as Request, mockResponse as Response, nextFunction);
      
      // Should call next() if the token is valid
      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest).toHaveProperty('user');
      expect((mockRequest as any).user.sub).toBe(MOCK_USER_ID);
    });
    
    it('should reject missing authorization header', () => {
      requireAuth(SECRET)(mockRequest as Request, mockResponse as Response, nextFunction);
      
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: AuthErrorType.MISSING_TOKEN,
        message: 'Authentication required'
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
    
    it('should reject refresh tokens', () => {
      // Create a refresh token instead of access token
      const token = jwt.sign({ 
        sub: MOCK_USER_ID,
        type: 'refresh' 
      }, SECRET);
      
      mockRequest.headers = {
        authorization: `Bearer ${token}`
      };
      
      requireAuth(SECRET)(mockRequest as Request, mockResponse as Response, nextFunction);
      
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: AuthErrorType.INVALID_TOKEN_TYPE,
        message: 'Invalid token type'
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
    
    it('should reject expired tokens with proper error type', () => {
      // Mock jwt.verify to throw TokenExpiredError
      jest.spyOn(jwt, 'verify').mockImplementation(() => {
        const error: any = new Error('jwt expired');
        error.name = 'TokenExpiredError';
        throw error;
      });
      
      mockRequest.headers = {
        authorization: `Bearer expired-token`
      };
      
      requireAuth(SECRET)(mockRequest as Request, mockResponse as Response, nextFunction);
      
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: AuthErrorType.EXPIRED_TOKEN,
        message: 'Token has expired'
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });
  
  describe('Helper functions', () => {
    it('should extract userId with getUserIdFromRequest', () => {
      (mockRequest as any).user = {
        sub: MOCK_USER_ID
      };
      
      const userId = getUserIdFromRequest(mockRequest as Request);
      expect(userId).toBe(MOCK_USER_ID);
    });
    
    it('should extract wallet addresses with getWalletAddressesFromRequest', () => {
      (mockRequest as any).user = {
        walletAddress: MOCK_SEI_WALLET,
        ethWalletAddress: MOCK_ETH_WALLET
      };
      
      const wallets = getWalletAddressesFromRequest(mockRequest as Request);
      expect(wallets.sei).toBe(MOCK_SEI_WALLET);
      expect(wallets.eth).toBe(MOCK_ETH_WALLET);
    });
    
    it('should return undefined for missing wallet addresses', () => {
      (mockRequest as any).user = {
        sub: MOCK_USER_ID
        // No wallet addresses
      };
      
      const wallets = getWalletAddressesFromRequest(mockRequest as Request);
      expect(wallets.sei).toBeUndefined();
      expect(wallets.eth).toBeUndefined();
    });
  });
});