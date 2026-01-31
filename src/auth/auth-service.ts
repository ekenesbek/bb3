/**
 * Core authentication service
 * Handles user registration, login, sessions, email verification, and password resets
 */
import bcrypt from "bcrypt";
import crypto from "crypto";
import type { User, Tenant, UserSession } from "./types.js";
import { db } from "../database/index.js";
import { TokenService } from "./token-service.js";
import { EmailService } from "./email-service.js";
import { AuditLogger } from "./audit-logger.js";

export class AuthService {
  private tokenService: TokenService;
  private emailService: EmailService;
  private auditLogger: AuditLogger;

  constructor() {
    this.tokenService = new TokenService();
    this.emailService = new EmailService();
    this.auditLogger = new AuditLogger();
  }

  // =========================================================================
  // REGISTRATION
  // =========================================================================

  /**
   * Register a new user with email/password
   */
  async registerWithEmail(params: {
    email: string;
    password: string;
    displayName?: string;
    locale?: string;
    country?: string;
    metadata?: Record<string, any>;
  }): Promise<{
    user: User;
    tenant: Tenant;
    tokens: { accessToken: string; refreshToken: string };
  }> {
    const { email, password, displayName, locale = "en", country, metadata = {} } = params;

    // Validate email format
    if (!this.isValidEmail(email)) {
      throw new Error("Invalid email format");
    }

    // Validate password strength
    if (!this.isValidPassword(password)) {
      throw new Error(
        "Password must be at least 8 characters with uppercase, lowercase, number, and symbol",
      );
    }

    // Check if email already exists
    const existingUser = await db.query<User>("SELECT id FROM users WHERE email = $1", [
      email.toLowerCase(),
    ]);

    if (existingUser.rows.length > 0) {
      throw new Error("Email already registered");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Start transaction
    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      // Create tenant (each user gets their own tenant by default)
      const tenantSlug = this.generateTenantSlug(email);
      const tenantResult = await client.query<Tenant>(
        `INSERT INTO tenants (name, slug, contact_email, plan_type, plan_status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [email, tenantSlug, email, "free", "trial"],
      );
      const tenant = tenantResult.rows[0];

      // Create user
      const userResult = await client.query<User>(
        `INSERT INTO users (
          tenant_id, email, password_hash, display_name, locale, country, role, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          tenant.id,
          email.toLowerCase(),
          passwordHash,
          displayName,
          locale,
          country,
          "owner",
          metadata,
        ],
      );
      const user = userResult.rows[0];

      // Generate email verification token
      const verificationToken = this.generateSecureToken();
      await client.query(
        `INSERT INTO email_verification_tokens (user_id, token, email, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')`,
        [user.id, verificationToken, email],
      );

      // Commit transaction
      await client.query("COMMIT");

      // Send verification email (async, don't wait)
      this.emailService
        .sendVerificationEmail(email, verificationToken, displayName)
        .catch((err) => {
          console.error("Failed to send verification email:", err);
        });

      // Generate tokens
      const tokens = await this.createSession({
        user,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
      });

      // Audit log
      await this.auditLogger.log({
        tenantId: tenant.id,
        userId: user.id,
        action: "user.registered",
        resourceType: "user",
        resourceId: user.id,
        status: "success",
        metadata: { method: "email", locale, country },
      });

      return { user, tenant, tokens };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Register with OAuth provider (Apple, Google, etc.)
   */
  async registerWithOAuth(params: {
    provider: "apple" | "google" | "github" | "discord";
    providerUserId: string;
    providerUsername?: string;
    providerEmail?: string;
    profileData: Record<string, any>;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
    locale?: string;
    country?: string;
  }): Promise<{
    user: User;
    tenant: Tenant;
    tokens: { accessToken: string; refreshToken: string };
  }> {
    const {
      provider,
      providerUserId,
      providerUsername,
      providerEmail,
      profileData,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      locale = "en",
      country,
    } = params;

    // Check if OAuth account already linked
    const existingOAuth = await db.query(
      "SELECT user_id FROM user_oauth_providers WHERE provider = $1 AND provider_user_id = $2",
      [provider, providerUserId],
    );

    if (existingOAuth.rows.length > 0) {
      // User already exists, just login
      const userId = existingOAuth.rows[0].user_id;
      return this.loginExistingOAuthUser(userId, provider, providerUserId);
    }

    // Check if email already exists
    let existingUser: User | null = null;
    if (providerEmail) {
      const userResult = await db.query<User>("SELECT * FROM users WHERE email = $1", [
        providerEmail.toLowerCase(),
      ]);
      if (userResult.rows.length > 0) {
        existingUser = userResult.rows[0];
      }
    }

    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      let user: User;
      let tenant: Tenant;

      if (existingUser) {
        // Link OAuth to existing user
        user = existingUser;
        const tenantResult = await client.query<Tenant>("SELECT * FROM tenants WHERE id = $1", [
          user.tenant_id,
        ]);
        tenant = tenantResult.rows[0];
      } else {
        // Create new tenant
        const email = providerEmail || `${provider}-${providerUserId}@oauth.local`;
        const tenantSlug = this.generateTenantSlug(email);
        const tenantResult = await client.query<Tenant>(
          `INSERT INTO tenants (name, slug, contact_email, plan_type, plan_status)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [email, tenantSlug, email, "free", "trial"],
        );
        tenant = tenantResult.rows[0];

        // Create user
        const displayName =
          profileData.name || providerUsername || `User-${providerUserId.slice(0, 8)}`;
        const userResult = await client.query<User>(
          `INSERT INTO users (
            tenant_id, email, display_name, username, locale, country, role,
            email_verified, email_verified_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *`,
          [
            tenant.id,
            email.toLowerCase(),
            displayName,
            providerUsername,
            locale,
            country,
            "owner",
            !!providerEmail, // Auto-verify if provider gave us email
            providerEmail ? new Date() : null,
          ],
        );
        user = userResult.rows[0];
      }

      // Link OAuth provider
      await client.query(
        `INSERT INTO user_oauth_providers (
          user_id, provider, provider_user_id, provider_username, provider_email,
          access_token, refresh_token, token_expires_at, profile_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          user.id,
          provider,
          providerUserId,
          providerUsername,
          providerEmail,
          accessToken,
          refreshToken,
          tokenExpiresAt,
          profileData,
        ],
      );

      await client.query("COMMIT");

      // Generate tokens
      const tokens = await this.createSession({ user });

      // Audit log
      await this.auditLogger.log({
        tenantId: tenant.id,
        userId: user.id,
        action: existingUser ? "user.oauth_linked" : "user.registered",
        resourceType: "user",
        resourceId: user.id,
        status: "success",
        metadata: { provider, method: "oauth" },
      });

      return { user, tenant, tokens };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // =========================================================================
  // LOGIN
  // =========================================================================

  /**
   * Login with email/password
   */
  async loginWithEmail(params: {
    email: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
    deviceId?: string;
  }): Promise<{
    user: User;
    tenant: Tenant;
    tokens: { accessToken: string; refreshToken: string };
  }> {
    const { email, password, ipAddress, userAgent, deviceId } = params;

    // Find user
    const userResult = await db.query<User>(
      "SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL",
      [email.toLowerCase()],
    );

    if (userResult.rows.length === 0) {
      // Audit failed login attempt
      await this.auditLogger.log({
        action: "user.login_failed",
        resourceType: "user",
        status: "failure",
        metadata: { email, reason: "user_not_found" },
        ipAddress,
        userAgent,
      });
      throw new Error("Invalid email or password");
    }

    const user = userResult.rows[0];

    // Check if user is suspended
    if (user.status !== "active") {
      await this.auditLogger.log({
        tenantId: user.tenant_id,
        userId: user.id,
        action: "user.login_failed",
        resourceType: "user",
        resourceId: user.id,
        status: "failure",
        metadata: { reason: "account_suspended" },
        ipAddress,
        userAgent,
      });
      throw new Error("Account suspended");
    }

    // Verify password
    if (!user.password_hash) {
      throw new Error("Please login with OAuth provider");
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      await this.auditLogger.log({
        tenantId: user.tenant_id,
        userId: user.id,
        action: "user.login_failed",
        resourceType: "user",
        resourceId: user.id,
        status: "failure",
        metadata: { reason: "invalid_password" },
        ipAddress,
        userAgent,
      });
      throw new Error("Invalid email or password");
    }

    // Check if 2FA is enabled
    if (user.two_factor_enabled) {
      // Return partial session that requires 2FA completion
      return this.createPending2FASession(user);
    }

    // Get tenant
    const tenantResult = await db.query<Tenant>("SELECT * FROM tenants WHERE id = $1", [
      user.tenant_id,
    ]);
    const tenant = tenantResult.rows[0];

    // Update last login
    await db.query(
      "UPDATE users SET last_login_at = NOW(), last_login_ip = $1, login_count = login_count + 1 WHERE id = $2",
      [ipAddress, user.id],
    );

    // Create session
    const tokens = await this.createSession({ user, ipAddress, userAgent, deviceId });

    // Audit log
    await this.auditLogger.log({
      tenantId: user.tenant_id,
      userId: user.id,
      action: "user.login",
      resourceType: "user",
      resourceId: user.id,
      status: "success",
      metadata: { method: "email" },
      ipAddress,
      userAgent,
    });

    return { user, tenant, tokens };
  }

  /**
   * Login with OAuth (existing user)
   */
  private async loginExistingOAuthUser(
    userId: string,
    provider: string,
    _providerUserId: string,
  ): Promise<{
    user: User;
    tenant: Tenant;
    tokens: { accessToken: string; refreshToken: string };
  }> {
    const userResult = await db.query<User>("SELECT * FROM users WHERE id = $1", [userId]);
    const user = userResult.rows[0];

    const tenantResult = await db.query<Tenant>("SELECT * FROM tenants WHERE id = $1", [
      user.tenant_id,
    ]);
    const tenant = tenantResult.rows[0];

    // Update OAuth last used
    await db.query(
      "UPDATE user_oauth_providers SET last_used_at = NOW() WHERE user_id = $1 AND provider = $2",
      [userId, provider],
    );

    // Create session
    const tokens = await this.createSession({ user });

    // Audit log
    await this.auditLogger.log({
      tenantId: user.tenant_id,
      userId: user.id,
      action: "user.login",
      resourceType: "user",
      resourceId: user.id,
      status: "success",
      metadata: { method: "oauth", provider },
    });

    return { user, tenant, tokens };
  }

  // =========================================================================
  // SESSION MANAGEMENT
  // =========================================================================

  /**
   * Create a new session with access + refresh tokens
   */
  private async createSession(params: {
    user: User;
    ipAddress?: string;
    userAgent?: string;
    deviceId?: string;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const { user, ipAddress, userAgent, deviceId } = params;

    // Generate tokens
    const accessToken = this.tokenService.generateAccessToken(user);
    const refreshToken = this.tokenService.generateRefreshToken(user);

    // Hash tokens for storage
    const accessTokenHash = this.hashToken(accessToken);
    const refreshTokenHash = this.hashToken(refreshToken);

    // Parse device info
    const deviceType = this.parseDeviceType(userAgent);

    // Store session
    await db.query(
      `INSERT INTO user_sessions (
        user_id, access_token_hash, refresh_token_hash,
        access_token_expires_at, refresh_token_expires_at,
        user_agent, ip_address, device_type, device_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        user.id,
        accessTokenHash,
        refreshTokenHash,
        new Date(Date.now() + 15 * 60 * 1000), // 15 min
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        userAgent,
        ipAddress,
        deviceType,
        deviceId,
      ],
    );

    return { accessToken, refreshToken };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const refreshTokenHash = this.hashToken(refreshToken);

    // Find session
    const sessionResult = await db.query<UserSession & User>(
      `SELECT s.*, u.* FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.refresh_token_hash = $1
         AND s.is_active = true
         AND s.refresh_token_expires_at > NOW()`,
      [refreshTokenHash],
    );

    if (sessionResult.rows.length === 0) {
      throw new Error("Invalid or expired refresh token");
    }

    const session = sessionResult.rows[0];
    const user = session as any as User;

    // Generate new tokens
    const newAccessToken = this.tokenService.generateAccessToken(user);
    const newRefreshToken = this.tokenService.generateRefreshToken(user);

    // Hash new tokens
    const newAccessTokenHash = this.hashToken(newAccessToken);
    const newRefreshTokenHash = this.hashToken(newRefreshToken);

    // Update session
    await db.query(
      `UPDATE user_sessions
       SET access_token_hash = $1,
           refresh_token_hash = $2,
           access_token_expires_at = $3,
           refresh_token_expires_at = $4,
           last_activity_at = NOW()
       WHERE id = $5`,
      [
        newAccessTokenHash,
        newRefreshTokenHash,
        new Date(Date.now() + 15 * 60 * 1000), // 15 min
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        session.id,
      ],
    );

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  /**
   * Validate access token and return user
   */
  async validateAccessToken(accessToken: string): Promise<User> {
    // Verify JWT signature and expiration
    const payload = this.tokenService.verifyAccessToken(accessToken);
    if (!payload) {
      throw new Error("Invalid access token");
    }

    // Hash token for lookup
    const accessTokenHash = this.hashToken(accessToken);

    // Find session
    const sessionResult = await db.query<UserSession & User>(
      `SELECT s.*, u.* FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.access_token_hash = $1
         AND s.is_active = true
         AND s.access_token_expires_at > NOW()`,
      [accessTokenHash],
    );

    if (sessionResult.rows.length === 0) {
      throw new Error("Session not found or expired");
    }

    const user = sessionResult.rows[0] as any as User;

    // Update last activity
    await db.query("UPDATE user_sessions SET last_activity_at = NOW() WHERE id = $1", [
      sessionResult.rows[0].id,
    ]);

    return user;
  }

  /**
   * Logout (revoke session)
   */
  async logout(accessToken: string): Promise<void> {
    const accessTokenHash = this.hashToken(accessToken);

    await db.query(
      "UPDATE user_sessions SET is_active = false, revoked_at = NOW(), revoked_reason = $1 WHERE access_token_hash = $2",
      ["user_logout", accessTokenHash],
    );
  }

  /**
   * Logout all sessions for user
   */
  async logoutAll(userId: string): Promise<void> {
    await db.query(
      "UPDATE user_sessions SET is_active = false, revoked_at = NOW(), revoked_reason = $1 WHERE user_id = $2",
      ["logout_all", userId],
    );
  }

  // =========================================================================
  // EMAIL VERIFICATION
  // =========================================================================

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<User> {
    const result = await db.query(
      `SELECT * FROM email_verification_tokens
       WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [token],
    );

    if (result.rows.length === 0) {
      throw new Error("Invalid or expired verification token");
    }

    const verification = result.rows[0];

    // Update user
    await db.query(
      "UPDATE users SET email_verified = true, email_verified_at = NOW() WHERE id = $1",
      [verification.user_id],
    );

    // Mark token as used
    await db.query("UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1", [
      verification.id,
    ]);

    const userResult = await db.query<User>("SELECT * FROM users WHERE id = $1", [
      verification.user_id,
    ]);
    return userResult.rows[0];
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(userId: string): Promise<void> {
    const userResult = await db.query<User>("SELECT * FROM users WHERE id = $1", [userId]);
    const user = userResult.rows[0];

    if (user.email_verified) {
      throw new Error("Email already verified");
    }

    // Generate new token
    const token = this.generateSecureToken();
    await db.query(
      `INSERT INTO email_verification_tokens (user_id, token, email, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')`,
      [user.id, token, user.email],
    );

    // Send email
    await this.emailService.sendVerificationEmail(user.email, token, user.display_name);
  }

  // =========================================================================
  // PASSWORD RESET
  // =========================================================================

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string, ipAddress?: string, userAgent?: string): Promise<void> {
    const userResult = await db.query<User>("SELECT * FROM users WHERE email = $1", [
      email.toLowerCase(),
    ]);

    // Always return success to prevent email enumeration
    if (userResult.rows.length === 0) {
      return;
    }

    const user = userResult.rows[0];

    // Generate reset token
    const token = this.generateSecureToken();
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at, ip_address, user_agent)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour', $3, $4)`,
      [user.id, token, ipAddress, userAgent],
    );

    // Send email
    await this.emailService.sendPasswordResetEmail(user.email, token, user.display_name);
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const result = await db.query(
      `SELECT * FROM password_reset_tokens
       WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [token],
    );

    if (result.rows.length === 0) {
      throw new Error("Invalid or expired reset token");
    }

    const resetToken = result.rows[0];

    // Validate new password
    if (!this.isValidPassword(newPassword)) {
      throw new Error(
        "Password must be at least 8 characters with uppercase, lowercase, number, and symbol",
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await db.query(
      "UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2",
      [passwordHash, resetToken.user_id],
    );

    // Mark token as used
    await db.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1", [
      resetToken.id,
    ]);

    // Revoke all sessions (force re-login)
    await this.logoutAll(resetToken.user_id);
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidPassword(password: string): boolean {
    // At least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 symbol
    const minLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSymbol = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    return minLength && hasUpper && hasLower && hasNumber && hasSymbol;
  }

  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private generateTenantSlug(email: string): string {
    const base = email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-");
    const random = crypto.randomBytes(4).toString("hex");
    return `${base}-${random}`;
  }

  private parseDeviceType(userAgent?: string): string {
    if (!userAgent) return "unknown";
    if (/mobile/i.test(userAgent)) return "mobile";
    if (/tablet|ipad/i.test(userAgent)) return "tablet";
    if (/electron/i.test(userAgent)) return "desktop";
    return "web";
  }

  private async createPending2FASession(_user: User): Promise<any> {
    // TODO: Implement 2FA pending session
    throw new Error("2FA not yet implemented");
  }

  /**
   * Check if a user exists by email
   */
  async userExists(email: string): Promise<boolean> {
    const result = await db.query<User>(
      "SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL",
      [email.toLowerCase()],
    );
    return result.rows.length > 0;
  }

  /**
   * Exchange JWT access token for Gateway token
   * This creates a short-lived token specifically for Gateway WebSocket connection
   */
  async exchangeForGatewayToken(accessToken: string): Promise<{
    gatewayToken: string;
    expiresAt: Date;
  }> {
    // Validate the access token
    const payload = this.tokenService.verifyAccessToken(accessToken);
    if (!payload) {
      throw new Error("Invalid access token");
    }

    // Generate a random gateway token (32 bytes = 64 hex chars)
    const gatewayToken = crypto.randomBytes(32).toString("hex");

    // Gateway tokens are short-lived (1 hour)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Store the gateway token in database
    const gatewayInsert = await db.query<{ id: string }>(
      `INSERT INTO gateway_tokens (token, user_id, tenant_id, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [gatewayToken, payload.sub, payload.tenant_id, expiresAt],
    );
    const gatewayTokenId = gatewayInsert.rows[0]?.id;

    // Audit log
    await this.auditLogger.log({
      tenantId: payload.tenant_id,
      userId: payload.sub,
      action: "gateway_token.created",
      resourceType: "gateway_token",
      resourceId: gatewayTokenId,
      status: "success",
      metadata: { expiresAt },
    });

    return { gatewayToken, expiresAt };
  }

  /**
   * Validate a gateway token
   * Returns user info if token is valid and not expired
   */
  async validateGatewayToken(token: string): Promise<{
    userId: string;
    tenantId: string;
    email: string;
  } | null> {
    const result = await db.query<{
      user_id: string;
      tenant_id: string;
      expires_at: Date;
      email: string;
    }>(
      `SELECT gt.user_id, gt.tenant_id, gt.expires_at, u.email
       FROM gateway_tokens gt
       JOIN users u ON u.id = gt.user_id
       WHERE gt.token = $1 AND gt.expires_at > NOW() AND gt.revoked_at IS NULL`,
      [token],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      userId: row.user_id,
      tenantId: row.tenant_id,
      email: row.email,
    };
  }
}
