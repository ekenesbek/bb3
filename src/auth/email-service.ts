/**
 * Email service for sending auth-related emails
 * TODO: Integrate with actual email provider (SendGrid, AWS SES, etc.)
 */

export class EmailService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  }

  /**
   * Send email verification email
   */
  async sendVerificationEmail(
    email: string,
    token: string,
    displayName?: string | null,
  ): Promise<void> {
    const verificationUrl = `${this.baseUrl}/auth/verify-email?token=${token}`;

    console.log(`
[EMAIL] Verification Email
To: ${email}
Subject: Verify your email address
---
Hello ${displayName || "there"}!

Please verify your email address by clicking the link below:
${verificationUrl}

This link will expire in 24 hours.

If you didn't create an account, you can safely ignore this email.

---
    `);

    // TODO: Implement actual email sending
    // await this.sendEmail({
    //   to: email,
    //   subject: 'Verify your email address',
    //   html: verificationEmailTemplate({ displayName, verificationUrl }),
    // });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    token: string,
    displayName?: string | null,
  ): Promise<void> {
    const resetUrl = `${this.baseUrl}/auth/reset-password?token=${token}`;

    console.log(`
[EMAIL] Password Reset
To: ${email}
Subject: Reset your password
---
Hello ${displayName || "there"}!

You requested to reset your password. Click the link below to continue:
${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email.

---
    `);

    // TODO: Implement actual email sending
    // await this.sendEmail({
    //   to: email,
    //   subject: 'Reset your password',
    //   html: passwordResetEmailTemplate({ displayName, resetUrl }),
    // });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(email: string, displayName?: string | null): Promise<void> {
    console.log(`
[EMAIL] Welcome Email
To: ${email}
Subject: Welcome to Clawdbot!
---
Hello ${displayName || "there"}!

Welcome to Clawdbot! We're excited to have you on board.

Get started by exploring our features and setting up your first agent.

If you have any questions, feel free to reach out to our support team.

---
    `);

    // TODO: Implement actual email sending
  }

  /**
   * Send invitation email
   */
  async sendInvitationEmail(
    email: string,
    inviterName: string,
    tenantName: string,
    token: string,
  ): Promise<void> {
    const acceptUrl = `${this.baseUrl}/auth/accept-invitation?token=${token}`;

    console.log(`
[EMAIL] Team Invitation
To: ${email}
Subject: You've been invited to join ${tenantName}
---
Hello!

${inviterName} has invited you to join ${tenantName} on Clawdbot.

Click the link below to accept the invitation:
${acceptUrl}

This invitation will expire in 7 days.

---
    `);

    // TODO: Implement actual email sending
  }
}
