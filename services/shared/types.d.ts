// Type declarations for modules that don't have proper type definitions
declare module 'express' {
  import * as e from 'express';
  export = e;
}

declare module 'jsonwebtoken' {
  import * as jwt from 'jsonwebtoken';
  export = jwt;
}