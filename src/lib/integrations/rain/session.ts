import "server-only";

import {
  constants,
  publicEncrypt,
  randomBytes as nodeRandomBytes,
} from "node:crypto";

/**
 * Public, sandbox-only RSA key published by Rain. This is not a credential.
 * Source: https://rain-sandbox-trial.mintlify.app/docs/resource-sessionid-keys
 */
export const RAIN_SANDBOX_SESSION_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCAP192809jZyaw62g/eTzJ3P9H
+RmT88sXUYjQ0K8Bx+rJ83f22+9isKx+lo5UuV8tvOlKwvdDS/pVbzpG7D7NO45c
0zkLOXwDHZkou8fuj8xhDO5Tq3GzcrabNLRLVz3dkx0znfzGOhnY4lkOMIdKxlQb
LuVM/dGDC9UpulF+UwIDAQAB
-----END PUBLIC KEY-----`;

type RandomBytesSource = (size: number) => Buffer;

/**
 * Rain expects the base64 representation of a fresh 16-byte (32 hex
 * character) secret to be RSA-OAEP encrypted and sent as `sessionid`.
 * SpendForge never returns the secret and zeroes the source buffer after use.
 */
export function generateRainSessionId(
  randomBytesSource: RandomBytesSource = nodeRandomBytes,
): string {
  const secretBytes = randomBytesSource(16);
  if (secretBytes.length !== 16) {
    secretBytes.fill(0);
    throw new Error("RAIN_SESSION_SECRET_INVALID_LENGTH");
  }

  try {
    const secretBase64 = secretBytes.toString("base64");
    return publicEncrypt(
      {
        key: RAIN_SANDBOX_SESSION_PUBLIC_KEY,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha1",
      },
      Buffer.from(secretBase64, "utf8"),
    ).toString("base64");
  } finally {
    secretBytes.fill(0);
  }
}
