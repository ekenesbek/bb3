/**
 * JWT token generation and validation service
 */
import jwt from "jsonwebtoken";
import type { User } from "./types.js";
import type { AccessTokenPayload, RefreshTokenPayload } from "./types.js";

export class TokenService {
  private accessTokenSecret: string;
  private refreshTokenSecret: string;
  private accessTokenTTL: number = 15 * 60; // 15 minutes
  private refreshTokenTTL: number = 30 * 24 * 60 * 60; // 30 days

  constructor(accessTokenSecret?: string, refreshTokenSecret?: string) {
    this.accessTokenSecret = accessTokenSecret || process.env.ACCESS_TOKEN_SECRET || "";
    this.refreshTokenSecret = refreshTokenSecret || process.env.REFRESH_TOKEN_SECRET || "";

    if (!this.accessTokenSecret || !this.refreshTokenSecret) {
      throw new Error("Token secrets not configured");
    }
  }

  /**
   * Generate access token (short-lived, 15 min)
   */
  generateAccessToken(user: User): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: AccessTokenPayload = {
      sub: user.id,
      tenant_id: user.tenant_id,
      email: user.email,
      role: user.role,
      type: "access",
      iat: now,
      exp: now + this.accessTokenTTL,
    };

    return jwt.sign(payload, this.accessTokenSecret, { algorithm: "HS256" });
  }

  /**
   * Generate refresh token (long-lived, 30 days)
   */
  generateRefreshToken(user: User): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: RefreshTokenPayload = {
      sub: user.id,
      type: "refresh",
      iat: now,
      exp: now + this.refreshTokenTTL,
    };

    return jwt.sign(payload, this.refreshTokenSecret, { algorithm: "HS256" });
  }

  /**
   * Verify and decode access token
   */
  verifyAccessToken(token: string): AccessTokenPayload | null {
    try {
      const payload = jwt.verify(token, this.accessTokenSecret) as AccessTokenPayload;
      if (payload.type !== "access") {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Verify and decode refresh token
   */
  verifyRefreshToken(token: string): RefreshTokenPayload | null {
    try {
      const payload = jwt.verify(token, this.refreshTokenSecret) as RefreshTokenPayload;
      if (payload.type !== "refresh") {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Decode token without verification (for debugging)
   */
  decodeToken(token: string): AccessTokenPayload | RefreshTokenPayload | null {
    try {
      return jwt.decode(token) as AccessTokenPayload | RefreshTokenPayload;
    } catch {
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return true;
    }
    const now = Math.floor(Date.now() / 1000);
    return decoded.exp < now;
  }
}
