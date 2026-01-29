/**
 * Rate limiting for authentication endpoints
 */
import { Redis } from "ioredis";

export class AuthRateLimiter {
  private redis: Redis | null = null;

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      this.redis = new Redis(redisUrl);
    } else {
      console.warn("Redis not configured - rate limiting will not work");
    }
  }

  /**
   * Check login rate limit (5 attempts per 15 minutes per IP)
   */
  async checkLoginRateLimit(ipAddress: string): Promise<boolean> {
    if (!this.redis) {
      return true; // Allow if Redis not configured
    }

    const key = `rate:login:${ipAddress}`;
    const current = await this.redis.incr(key);

    if (current === 1) {
      await this.redis.expire(key, 15 * 60); // 15 minutes
    }

    return current <= 5;
  }

  /**
   * Check registration rate limit (3 per hour per IP)
   */
  async checkRegistrationRateLimit(ipAddress: string): Promise<boolean> {
    if (!this.redis) {
      return true; // Allow if Redis not configured
    }

    const key = `rate:register:${ipAddress}`;
    const current = await this.redis.incr(key);

    if (current === 1) {
      await this.redis.expire(key, 60 * 60); // 1 hour
    }

    return current <= 3;
  }

  /**
   * Check password reset rate limit (3 per hour per IP)
   */
  async checkPasswordResetRateLimit(ipAddress: string): Promise<boolean> {
    if (!this.redis) {
      return true; // Allow if Redis not configured
    }

    const key = `rate:password-reset:${ipAddress}`;
    const current = await this.redis.incr(key);

    if (current === 1) {
      await this.redis.expire(key, 60 * 60); // 1 hour
    }

    return current <= 3;
  }

  /**
   * Check email verification rate limit (5 per hour per user)
   */
  async checkEmailVerificationRateLimit(userId: string): Promise<boolean> {
    if (!this.redis) {
      return true; // Allow if Redis not configured
    }

    const key = `rate:email-verify:${userId}`;
    const current = await this.redis.incr(key);

    if (current === 1) {
      await this.redis.expire(key, 60 * 60); // 1 hour
    }

    return current <= 5;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
