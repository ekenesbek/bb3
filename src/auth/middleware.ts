/**
 * Authentication middleware for Express
 */
import type { Request, Response, NextFunction } from "express";
import { AuthService } from "./auth-service.js";
import type { User } from "./types.js";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: User;
      tenantId?: string;
    }
  }
}

const authService = new AuthService();

/**
 * Require authentication
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res
        .status(401)
        .json({ error: "Unauthorized", message: "Missing or invalid authorization header" });
      return;
    }

    const token = authHeader.substring(7);

    // Validate token
    const user = await authService.validateAccessToken(token);

    // Attach user to request
    req.user = user;
    req.tenantId = user.tenant_id;

    // Set tenant context for RLS (if using PostgreSQL RLS)
    // await req.app.locals.db.query('SELECT set_tenant_context($1)', [user.tenant_id]);

    next();
  } catch (error: any) {
    res.status(401).json({ error: "Unauthorized", message: error.message });
  }
}

/**
 * Require specific role
 */
export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden", message: "Insufficient permissions" });
      return;
    }

    next();
  };
}

/**
 * Optional auth (doesn't fail if no token)
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const user = await authService.validateAccessToken(token);
      req.user = user;
      req.tenantId = user.tenant_id;
    }
    next();
  } catch (error) {
    // Ignore errors for optional auth
    next();
  }
}
