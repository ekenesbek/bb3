/**
 * TypeScript types for authentication system
 */

// ============================================================================
// TENANT TYPES
// ============================================================================

export interface Tenant {
  id: string;
  name: string;
  display_name: string | null;
  slug: string;
  contact_email: string;
  contact_name: string | null;
  plan_type: "free" | "pro" | "enterprise" | "custom";
  plan_status: "active" | "suspended" | "cancelled" | "trial";
  trial_ends_at: Date | null;
  subscription_starts_at: Date | null;
  subscription_ends_at: Date | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  limits: TenantLimits;
  settings: TenantSettings;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface TenantLimits {
  maxUsers: number;
  maxAgents: number;
  maxChannels: number;
  maxMessagesPerMonth: number;
  maxStorageMb: number;
  maxWebSearchesPerDay: number;
}

export interface TenantSettings {
  locale: string;
  timezone: string;
  features: Record<string, any>;
  branding: Record<string, any>;
}

// ============================================================================
// USER TYPES
// ============================================================================

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  email_verified: boolean;
  email_verified_at: Date | null;
  password_hash: string | null;
  password_changed_at: Date | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  locale: string;
  timezone: string;
  country: string | null;
  region: string | null;
  role: "owner" | "admin" | "member" | "viewer";
  permissions: string[];
  status: "active" | "suspended" | "deactivated" | "deleted";
  two_factor_enabled: boolean;
  two_factor_secret: string | null;
  backup_codes: string[] | null;
  last_login_at: Date | null;
  last_login_ip: string | null;
  last_active_at: Date | null;
  login_count: number;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

// ============================================================================
// OAuth TYPES
// ============================================================================

export interface UserOAuthProvider {
  id: string;
  user_id: string;
  provider: "apple" | "google" | "github" | "discord";
  provider_user_id: string;
  provider_username: string | null;
  provider_email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: Date | null;
  scope: string[];
  profile_data: Record<string, any>;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  last_used_at: Date | null;
}

// ============================================================================
// SESSION TYPES
// ============================================================================

export interface UserSession {
  id: string;
  user_id: string;
  access_token_hash: string;
  refresh_token_hash: string | null;
  access_token_expires_at: Date;
  refresh_token_expires_at: Date | null;
  user_agent: string | null;
  ip_address: string | null;
  device_type: string | null;
  device_name: string | null;
  device_id: string | null;
  country: string | null;
  city: string | null;
  is_active: boolean;
  revoked_at: Date | null;
  revoked_reason: string | null;
  last_activity_at: Date;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// TOKEN TYPES
// ============================================================================

export interface EmailVerificationToken {
  id: string;
  user_id: string;
  token: string;
  email: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface PasswordResetToken {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  used_at: Date | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

// ============================================================================
// INVITATION TYPES
// ============================================================================

export interface UserInvitation {
  id: string;
  tenant_id: string;
  invited_by_user_id: string;
  email: string;
  role: "admin" | "member" | "viewer";
  token: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: Date;
  accepted_at: Date | null;
  accepted_by_user_id: string | null;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================

export interface AuditLog {
  id: number;
  tenant_id: string | null;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  changes: Record<string, any> | null;
  metadata: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  status: "success" | "failure";
  error_message: string | null;
  created_at: Date;
}

// ============================================================================
// JWT PAYLOAD TYPES
// ============================================================================

export interface AccessTokenPayload {
  sub: string; // user.id
  tenant_id: string;
  email: string;
  role: string;
  type: "access";
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string; // user.id
  type: "refresh";
  iat: number;
  exp: number;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
  locale?: string;
  country?: string;
  metadata?: Record<string, any>;
}

export interface LoginRequest {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
}

export interface RegisterResponse {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    emailVerified: boolean;
  };
  tenant: {
    id: string;
    name: string;
    planType: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    emailVerified: boolean;
  };
  tenant: {
    id: string;
    name: string;
    planType: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

// ============================================================================
// OAUTH PROVIDER TYPES
// ============================================================================

export interface AppleAuthData {
  id_token: string;
  code?: string;
  state?: string;
  user?: {
    name?: {
      firstName?: string;
      lastName?: string;
    };
    email?: string;
  };
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  email_verified: boolean;
}
