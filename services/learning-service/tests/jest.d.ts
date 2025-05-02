// Global Jest type declarations
import '@types/jest';

// This ensures the global Jest functions are recognized
declare global {
  const describe: jest.Describe;
  const expect: jest.Expect;
  const it: jest.It;
  const test: jest.It;
  const beforeAll: jest.Lifecycle;
  const afterAll: jest.Lifecycle;
  const beforeEach: jest.Lifecycle;
  const afterEach: jest.Lifecycle;
  const jest: jest.Jest;
}