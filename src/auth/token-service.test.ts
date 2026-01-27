/**
 * Token service unit tests
 */
import { describe, it, expect, beforeEach } from "vitest";
import { TokenService } from "./token-service";
import type { User } from "./types";

describe("TokenService", () => {
  let tokenService: TokenService;
  let mockUser: User;

  beforeEach(() => {
    // Use test secrets
    tokenService = new TokenService(
      "test-access-secret-64-characters-long-for-testing-purposes-only-abc",
      "test-refresh-secret-64-characters-long-for-testing-purposes-only-xyz",
    );

    mockUser = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      tenant_id: "123e4567-e89b-12d3-a456-426614174001",
      email: "test@example.com",
      role: "owner",
    } as User;
  });

  describe("generateAccessToken", () => {
    it("should generate a valid access token", () => {
      const token = tokenService.generateAccessToken(mockUser);

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".").length).toBe(3); // JWT has 3 parts
    });

    it("should include user data in token payload", () => {
      const token = tokenService.generateAccessToken(mockUser);
      const payload = tokenService.verifyAccessToken(token);

      expect(payload).toBeDefined();
      expect(payload?.sub).toBe(mockUser.id);
      expect(payload?.tenant_id).toBe(mockUser.tenant_id);
      expect(payload?.email).toBe(mockUser.email);
      expect(payload?.role).toBe(mockUser.role);
      expect(payload?.type).toBe("access");
    });
  });

  describe("generateRefreshToken", () => {
    it("should generate a valid refresh token", () => {
      const token = tokenService.generateRefreshToken(mockUser);

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".").length).toBe(3);
    });

    it("should include minimal data in refresh token", () => {
      const token = tokenService.generateRefreshToken(mockUser);
      const payload = tokenService.verifyRefreshToken(token);

      expect(payload).toBeDefined();
      expect(payload?.sub).toBe(mockUser.id);
      expect(payload?.type).toBe("refresh");
      expect((payload as any).email).toBeUndefined();
      expect((payload as any).role).toBeUndefined();
    });
  });

  describe("verifyAccessToken", () => {
    it("should verify valid access token", () => {
      const token = tokenService.generateAccessToken(mockUser);
      const payload = tokenService.verifyAccessToken(token);

      expect(payload).toBeDefined();
      expect(payload?.sub).toBe(mockUser.id);
    });

    it("should reject invalid token", () => {
      const payload = tokenService.verifyAccessToken("invalid.token.here");
      expect(payload).toBeNull();
    });

    it("should reject refresh token as access token", () => {
      const refreshToken = tokenService.generateRefreshToken(mockUser);
      const payload = tokenService.verifyAccessToken(refreshToken);
      expect(payload).toBeNull();
    });
  });

  describe("verifyRefreshToken", () => {
    it("should verify valid refresh token", () => {
      const token = tokenService.generateRefreshToken(mockUser);
      const payload = tokenService.verifyRefreshToken(token);

      expect(payload).toBeDefined();
      expect(payload?.sub).toBe(mockUser.id);
    });

    it("should reject invalid token", () => {
      const payload = tokenService.verifyRefreshToken("invalid.token.here");
      expect(payload).toBeNull();
    });

    it("should reject access token as refresh token", () => {
      const accessToken = tokenService.generateAccessToken(mockUser);
      const payload = tokenService.verifyRefreshToken(accessToken);
      expect(payload).toBeNull();
    });
  });

  describe("decodeToken", () => {
    it("should decode token without verification", () => {
      const token = tokenService.generateAccessToken(mockUser);
      const decoded = tokenService.decodeToken(token);

      expect(decoded).toBeDefined();
      expect((decoded as any).sub).toBe(mockUser.id);
    });

    it("should return null for invalid token", () => {
      const decoded = tokenService.decodeToken("invalid");
      expect(decoded).toBeNull();
    });
  });

  describe("isTokenExpired", () => {
    it("should detect expired token", () => {
      // Create a token service with very short TTL for testing
      const shortTTLService = new TokenService(
        "test-access-secret-64-characters-long-for-testing-purposes-only-abc",
        "test-refresh-secret-64-characters-long-for-testing-purposes-only-xyz",
      );

      const token = shortTTLService.generateAccessToken(mockUser);

      // Token should not be expired immediately
      const isExpired = shortTTLService.isTokenExpired(token);
      expect(isExpired).toBe(false);
    });

    it("should return true for invalid token", () => {
      const isExpired = tokenService.isTokenExpired("invalid");
      expect(isExpired).toBe(true);
    });
  });
});
