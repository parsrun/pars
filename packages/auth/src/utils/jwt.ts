/**
 * JWT Utilities using jose library
 */

import * as jose from "jose";
import type { JwtPayload, JwtConfig } from "../types.js";

export interface JwtManager {
  signAccessToken(payload: Omit<JwtPayload, "iat" | "exp">): Promise<string>;
  signRefreshToken(payload: Pick<JwtPayload, "sub" | "sid">): Promise<string>;
  verifyAccessToken(token: string): Promise<JwtPayload>;
  verifyRefreshToken(token: string): Promise<Pick<JwtPayload, "sub" | "sid">>;
}

export function createJwtManager(secret: string, config: JwtConfig = {}): JwtManager {
  const {
    accessTokenExpiresIn = 15 * 60, // 15 minutes
    refreshTokenExpiresIn = 7 * 24 * 60 * 60, // 7 days
    issuer = "pars",
    audience = "pars",
    algorithm = "HS256",
  } = config;

  const secretKey = new TextEncoder().encode(secret);

  async function signAccessToken(
    payload: Omit<JwtPayload, "iat" | "exp">
  ): Promise<string> {
    const jwt = new jose.SignJWT(payload as jose.JWTPayload)
      .setProtectedHeader({ alg: algorithm })
      .setIssuedAt()
      .setExpirationTime(`${accessTokenExpiresIn}s`);

    if (issuer) jwt.setIssuer(issuer);
    if (audience) jwt.setAudience(audience);

    return jwt.sign(secretKey);
  }

  async function signRefreshToken(
    payload: Pick<JwtPayload, "sub" | "sid">
  ): Promise<string> {
    return new jose.SignJWT(payload as jose.JWTPayload)
      .setProtectedHeader({ alg: algorithm })
      .setIssuedAt()
      .setExpirationTime(`${refreshTokenExpiresIn}s`)
      .setIssuer(issuer || "pars")
      .sign(secretKey);
  }

  async function verifyAccessToken(token: string): Promise<JwtPayload> {
    const { payload } = await jose.jwtVerify(token, secretKey, {
      issuer,
      audience,
    });
    return payload as unknown as JwtPayload;
  }

  async function verifyRefreshToken(
    token: string
  ): Promise<Pick<JwtPayload, "sub" | "sid">> {
    const { payload } = await jose.jwtVerify(token, secretKey, {
      issuer: issuer || "pars",
    });
    return payload as unknown as Pick<JwtPayload, "sub" | "sid">;
  }

  return {
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
  };
}
