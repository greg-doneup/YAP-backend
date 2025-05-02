// This file ensures TypeScript correctly handles JSON imports in tests
import { resolve } from 'path';
import { register } from 'ts-node';

// Register TypeScript compiler for tests
register({
  project: resolve(__dirname, '../tsconfig.json')
});

// Handle JSON imports
module.exports = {
  process(src: string) {
    return {
      code: `module.exports = ${JSON.stringify(JSON.parse(src))};`
    };
  }
};