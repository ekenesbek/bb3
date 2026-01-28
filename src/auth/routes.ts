/**
 * Authentication API routes
 */
import express from "express";
import { AuthService } from "./auth-service.js";
import { AppleOAuth } from "./oauth/apple-oauth.js";
import { GoogleOAuth } from "./oauth/google-oauth.js";
import { requireAuth } from "./middleware.js";

const router = express.Router();
const authService = new AuthService();

// Initialize OAuth providers (only if env vars are set)
let appleOAuth: AppleOAuth | null = null;
let googleOAuth: GoogleOAuth | null = null;

if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID) {
  try {
    appleOAuth = new AppleOAuth();
  } catch (error) {
    console.warn("Apple OAuth not properly configured:", error);
  }
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  googleOAuth = new GoogleOAuth();
}

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * Register with email/password
 */
router.post("/register", async (req, res) => {
  try {
    const { email, password, displayName, locale, country } = req.body;

    const result = await authService.registerWithEmail({
      email,
      password,
      displayName,
      locale,
      country,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    res.status(201).json({
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.display_name,
        emailVerified: result.user.email_verified,
      },
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        planType: result.tenant.plan_type,
      },
      tokens: result.tokens,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// USER CHECK
// ============================================================================

/**
 * Check if user exists by email
 */
router.post("/check-user", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const exists = await authService.userExists(email);
    res.json({ exists });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// LOGIN
// ============================================================================

/**
 * Login with email/password
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await authService.loginWithEmail({
      email,
      password,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.display_name,
        emailVerified: result.user.email_verified,
      },
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        planType: result.tenant.plan_type,
      },
      tokens: result.tokens,
    });
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});

/**
 * Logout
 */
router.post("/logout", requireAuth, async (req, res) => {
  try {
    const token = req.headers.authorization!.substring(7);
    await authService.logout(token);
    res.json({ message: "Logged out successfully" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Logout all sessions
 */
router.post("/logout-all", requireAuth, async (req, res) => {
  try {
    await authService.logoutAll(req.user!.id);
    res.json({ message: "All sessions logged out" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// TOKEN REFRESH
// ============================================================================

/**
 * Refresh access token
 */
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshAccessToken(refreshToken);
    res.json(tokens);
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});

// ============================================================================
// OAUTH
// ============================================================================

/**
 * Apple Sign In - Get auth URL (server-side flow)
 */
router.get("/oauth/apple/url", (req, res) => {
  if (!appleOAuth) {
    res.status(400).json({ error: "Apple Sign In not configured" });
    return;
  }

  const { state, scope } = req.query;
  const url = appleOAuth.getAuthUrl({
    state: state as string,
    scope: scope ? (scope as string).split(",") : undefined,
  });
  res.json({ url });
});

/**
 * Apple Sign In - Handle server callback
 */
router.post("/oauth/apple/callback", async (req, res) => {
  try {
    if (!appleOAuth) {
      res.status(400).json({ error: "Apple Sign In not configured" });
      return;
    }

    const result = await appleOAuth.handleServerCallback(req.body);
    res.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.display_name,
      },
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
      },
      tokens: result.tokens,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Apple Sign In - Handle client callback (from iOS/Android/Web SDK)
 */
router.post("/oauth/apple/client", async (req, res) => {
  try {
    if (!appleOAuth) {
      res.status(400).json({ error: "Apple Sign In not configured" });
      return;
    }

    const result = await appleOAuth.handleClientCallback(req.body);
    res.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.display_name,
      },
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
      },
      tokens: result.tokens,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Google OAuth - Get auth URL
 */
router.get("/oauth/google/url", (req, res) => {
  if (!googleOAuth) {
    res.status(400).json({ error: "Google OAuth not configured" });
    return;
  }

  const url = googleOAuth.getAuthUrl();
  res.json({ url });
});

/**
 * Google OAuth - Handle callback
 */
router.post("/oauth/google/callback", async (req, res) => {
  try {
    if (!googleOAuth) {
      res.status(400).json({ error: "Google OAuth not configured" });
      return;
    }

    const { code } = req.body;
    const result = await googleOAuth.handleCallback(code);
    res.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.display_name,
      },
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
      },
      tokens: result.tokens,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// EMAIL VERIFICATION
// ============================================================================

/**
 * Verify email
 */
router.post("/verify-email", async (req, res) => {
  try {
    const { token } = req.body;
    const user = await authService.verifyEmail(token);
    res.json({ message: "Email verified successfully", emailVerified: user.email_verified });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Resend verification email
 */
router.post("/resend-verification", requireAuth, async (req, res) => {
  try {
    await authService.resendVerificationEmail(req.user!.id);
    res.json({ message: "Verification email sent" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// PASSWORD RESET
// ============================================================================

/**
 * Request password reset
 */
router.post("/reset-password/request", async (req, res) => {
  try {
    const { email } = req.body;
    await authService.requestPasswordReset(email, req.ip, req.headers["user-agent"]);
    // Always return success to prevent email enumeration
    res.json({ message: "If the email exists, a reset link has been sent" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Reset password
 */
router.post("/reset-password/confirm", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    await authService.resetPassword(token, newPassword);
    res.json({ message: "Password reset successfully" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// USER INFO
// ============================================================================

/**
 * Get current user
 */
router.get("/me", requireAuth, async (req, res) => {
  res.json({
    user: {
      id: req.user!.id,
      email: req.user!.email,
      displayName: req.user!.display_name,
      username: req.user!.username,
      avatarUrl: req.user!.avatar_url,
      emailVerified: req.user!.email_verified,
      role: req.user!.role,
      locale: req.user!.locale,
      timezone: req.user!.timezone,
      createdAt: req.user!.created_at,
    },
  });
});

export default router;
