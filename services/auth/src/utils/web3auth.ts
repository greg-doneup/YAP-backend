import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const client = jwksClient({
  jwksUri: 'https://api.openlogin.com/jwks', // Web3Auth public JWKs
  cache: true,
  cacheMaxAge: 60 * 60 * 1000,
});

function getKey(header: any, cb: any) {
  client.getSigningKey(header.kid, (err, key) => {
    const signingKey = key?.getPublicKey();
    cb(err, signingKey);
  });
}

export async function verifyWeb3AuthIdToken(idToken: string) {
  return new Promise<{ sub: string }>((resolve, reject) => {
    jwt.verify(idToken, getKey, {}, (err, decoded) => {
      if (err || !decoded) return reject(err);
      resolve(decoded as { sub: string });
    });
  });
}
