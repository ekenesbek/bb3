/**
 * Authentication module exports
 */

// Core services
export { AuthService } from "./auth-service.js";
export { TokenService } from "./token-service.js";
export { EmailService } from "./email-service.js";
export { AuditLogger } from "./audit-logger.js";
export { AuthRateLimiter } from "./rate-limiter.js";

// Middleware
export { requireAuth, requireRole, optionalAuth } from "./middleware.js";

// OAuth providers
export { AppleOAuth } from "./oauth/apple-oauth.js";
export { GoogleOAuth } from "./oauth/google-oauth.js";

// Routes
export { default as authRoutes } from "./routes.js";

// Metrics
export { authMetrics } from "./monitoring.js";

// Types
export type {
  User,
  Tenant,
  UserSession,
  UserOAuthProvider,
  EmailVerificationToken,
  PasswordResetToken,
  UserInvitation,
  AuditLog,
  AccessTokenPayload,
  RefreshTokenPayload,
  AppleAuthData,
  GoogleProfile,
  TenantLimits,
  TenantSettings,
} from "./types.js";
