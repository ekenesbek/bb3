/**
 * Google OAuth authentication
 */
import { OAuth2Client } from "google-auth-library";
import { AuthService } from "../auth-service.js";

export class GoogleOAuth {
  private oauth2Client: OAuth2Client;
  private authService: AuthService;

  constructor() {
    this.oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    this.authService = new AuthService();
  }

  /**
   * Generate authorization URL
   */
  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["openid", "email", "profile"],
      prompt: "consent",
    });
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(code: string): Promise<{ user: any; tenant: any; tokens: any }> {
    // Exchange code for tokens
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    // Get user info
    const ticket = await this.oauth2Client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error("Invalid Google ID token");
    }

    // Register or login
    return this.authService.registerWithOAuth({
      provider: "google",
      providerUserId: payload.sub,
      providerEmail: payload.email,
      profileData: {
        name: payload.name,
        given_name: payload.given_name,
        family_name: payload.family_name,
        picture: payload.picture,
        email_verified: payload.email_verified,
      },
      accessToken: tokens.access_token ?? undefined,
      refreshToken: tokens.refresh_token ?? undefined,
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    });
  }
}
