/**
 * Apple Sign In OAuth authentication
 * Supports both server-side and client-side flows
 */
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { AuthService } from "../auth-service.js";

export interface AppleAuthConfig {
  clientId: string; // Service ID (e.g., com.yourapp.signin)
  teamId: string; // Apple Developer Team ID
  keyId: string; // Key ID from Apple Developer Portal
  privateKey: string; // P8 private key content
  redirectUri?: string; // For server-side flow
}

export interface AppleTokenPayload {
  iss: string; // https://appleid.apple.com
  aud: string; // Your client ID
  exp: number;
  iat: number;
  sub: string; // User's unique Apple ID
  at_hash: string;
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
  auth_time: number;
  nonce_supported?: boolean;
}

export interface AppleUserInfo {
  name?: {
    firstName?: string;
    lastName?: string;
  };
  email?: string;
}

export class AppleOAuth {
  private config: AppleAuthConfig;
  private authService: AuthService;

  constructor(config?: Partial<AppleAuthConfig>) {
    this.config = {
      clientId: config?.clientId || process.env.APPLE_CLIENT_ID || "",
      teamId: config?.teamId || process.env.APPLE_TEAM_ID || "",
      keyId: config?.keyId || process.env.APPLE_KEY_ID || "",
      privateKey: config?.privateKey || process.env.APPLE_PRIVATE_KEY || "",
      redirectUri: config?.redirectUri ?? process.env.APPLE_REDIRECT_URI ?? "",
    };

    if (!this.config.clientId || !this.config.teamId || !this.config.keyId) {
      throw new Error("Apple OAuth not properly configured");
    }

    this.authService = new AuthService();
  }

  /**
   * Generate client secret JWT for Apple Sign In
   * Required for server-to-server communication
   */
  generateClientSecret(): string {
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iss: this.config.teamId,
      iat: now,
      exp: now + 15777000, // 6 months (max allowed by Apple)
      aud: "https://appleid.apple.com",
      sub: this.config.clientId,
    };

    // Apple requires ES256 algorithm
    return jwt.sign(payload, this.config.privateKey, {
      algorithm: "ES256",
      keyid: this.config.keyId,
    });
  }

  /**
   * Generate authorization URL for server-side flow
   */
  getAuthUrl(
    options: {
      state?: string;
      scope?: string[];
      responseMode?: "form_post" | "query" | "fragment";
    } = {},
  ): string {
    const {
      state = this.generateState(),
      scope = ["name", "email"],
      responseMode = "form_post",
    } = options;

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri ?? "",
      response_type: "code id_token",
      response_mode: responseMode,
      scope: scope.join(" "),
      state,
    });

    return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
  }

  /**
   * Verify Apple ID token
   */
  async verifyIdToken(idToken: string): Promise<AppleTokenPayload> {
    try {
      // Get Apple's public keys
      const keys = await this.fetchApplePublicKeys();

      // Decode token header to get key ID
      const decoded = jwt.decode(idToken, { complete: true });
      if (!decoded || typeof decoded === "string") {
        throw new Error("Invalid ID token format");
      }

      const kid = decoded.header.kid;
      if (!kid) {
        throw new Error("No key ID in token header");
      }

      // Find matching public key
      const key = keys.find((k: any) => k.kid === kid);
      if (!key) {
        throw new Error("Public key not found");
      }

      // Convert JWK to PEM
      const publicKey = this.jwkToPem(key);

      // Verify and decode token
      const payload = jwt.verify(idToken, publicKey, {
        algorithms: ["RS256"],
        audience: this.config.clientId,
        issuer: "https://appleid.apple.com",
      }) as AppleTokenPayload;

      return payload;
    } catch (error: any) {
      throw new Error(`Apple ID token verification failed: ${error.message}`);
    }
  }

  /**
   * Exchange authorization code for tokens (server-side flow)
   */
  async exchangeCodeForTokens(code: string): Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    id_token: string;
  }> {
    const clientSecret = this.generateClientSecret();

    const response = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: this.config.redirectUri ?? "",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Handle Apple Sign In callback (server-side flow)
   */
  async handleServerCallback(params: {
    code: string;
    id_token: string;
    user?: string; // JSON string with user info (only on first sign in)
    state?: string;
  }): Promise<{ user: any; tenant: any; tokens: any }> {
    // Verify ID token
    const idTokenPayload = await this.verifyIdToken(params.id_token);

    // Parse user info if provided (only sent on first authentication)
    let userInfo: AppleUserInfo | undefined;
    if (params.user) {
      try {
        userInfo = JSON.parse(params.user);
      } catch (error) {
        console.warn("Failed to parse Apple user info:", error);
      }
    }

    // Build display name
    let displayName: string | undefined;
    if (userInfo?.name) {
      const parts = [];
      if (userInfo.name.firstName) parts.push(userInfo.name.firstName);
      if (userInfo.name.lastName) parts.push(userInfo.name.lastName);
      if (parts.length > 0) {
        displayName = parts.join(" ");
      }
    }

    // Check if email is private relay
    const isPrivateEmail =
      idTokenPayload.is_private_email === "true" || idTokenPayload.is_private_email === true;

    // Register or login
    return this.authService.registerWithOAuth({
      provider: "apple",
      providerUserId: idTokenPayload.sub,
      providerEmail: idTokenPayload.email,
      profileData: {
        email: idTokenPayload.email,
        email_verified:
          idTokenPayload.email_verified === "true" || idTokenPayload.email_verified === true,
        is_private_email: isPrivateEmail,
        name: displayName,
        ...userInfo,
      },
    });
  }

  /**
   * Handle Apple Sign In from client (iOS/Android/Web SDK)
   * Client sends the ID token and optional user info
   */
  async handleClientCallback(params: {
    id_token: string;
    user?: AppleUserInfo;
  }): Promise<{ user: any; tenant: any; tokens: any }> {
    // Verify ID token
    const idTokenPayload = await this.verifyIdToken(params.id_token);

    // Build display name
    let displayName: string | undefined;
    if (params.user?.name) {
      const parts = [];
      if (params.user.name.firstName) parts.push(params.user.name.firstName);
      if (params.user.name.lastName) parts.push(params.user.name.lastName);
      if (parts.length > 0) {
        displayName = parts.join(" ");
      }
    }

    // Check if email is private relay
    const isPrivateEmail =
      idTokenPayload.is_private_email === "true" || idTokenPayload.is_private_email === true;

    // Register or login
    return this.authService.registerWithOAuth({
      provider: "apple",
      providerUserId: idTokenPayload.sub,
      providerEmail: idTokenPayload.email,
      profileData: {
        email: idTokenPayload.email,
        email_verified:
          idTokenPayload.email_verified === "true" || idTokenPayload.email_verified === true,
        is_private_email: isPrivateEmail,
        name: displayName,
        ...params.user,
      },
    });
  }

  /**
   * Revoke Apple refresh token (for account deletion)
   */
  async revokeToken(refreshToken: string): Promise<void> {
    const clientSecret = this.generateClientSecret();

    const response = await fetch("https://appleid.apple.com/auth/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: clientSecret,
        token: refreshToken,
        token_type_hint: "refresh_token",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token revocation failed: ${error}`);
    }
  }

  /**
   * Fetch Apple's public keys for token verification
   */
  private async fetchApplePublicKeys(): Promise<any[]> {
    const response = await fetch("https://appleid.apple.com/auth/keys");
    if (!response.ok) {
      throw new Error("Failed to fetch Apple public keys");
    }
    const data = await response.json();
    return data.keys;
  }

  /**
   * Convert JWK to PEM format
   */
  private jwkToPem(jwk: any): string {
    // For RS256, we need the modulus (n) and exponent (e)
    const modulus = Buffer.from(jwk.n, "base64");
    const exponent = Buffer.from(jwk.e, "base64");

    // Build DER format
    const derPrefix = Buffer.from([
      0x30, // SEQUENCE
      0x82, // Length (2 bytes)
      0x01, // High byte
      0x22, // Low byte (290 bytes)
      0x30, // SEQUENCE
      0x0d, // Length (13 bytes)
      0x06, // OBJECT IDENTIFIER
      0x09, // Length (9 bytes)
      0x2a,
      0x86,
      0x48,
      0x86,
      0xf7,
      0x0d,
      0x01,
      0x01,
      0x01, // RSA encryption OID
      0x05, // NULL
      0x00, // Length (0)
      0x03, // BIT STRING
      0x82, // Length (2 bytes)
      0x01, // High byte
      0x0f, // Low byte (271 bytes)
      0x00, // Unused bits
      0x30, // SEQUENCE
      0x82, // Length (2 bytes)
      0x01, // High byte
      0x0a, // Low byte (266 bytes)
    ]);

    // Create DER-encoded key
    const derKey = Buffer.concat([
      derPrefix,
      Buffer.from([0x02, 0x82, 0x01, 0x01, 0x00]), // INTEGER (modulus)
      modulus,
      Buffer.from([0x02, 0x03]), // INTEGER (exponent)
      exponent,
    ]);

    // Convert to PEM
    const base64 = derKey.toString("base64");
    const pem = `-----BEGIN PUBLIC KEY-----\n${base64.match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
    return pem;
  }

  /**
   * Generate random state for CSRF protection
   */
  private generateState(): string {
    return crypto.randomBytes(32).toString("hex");
  }
}
