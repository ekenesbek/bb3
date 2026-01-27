/**
 * Audit logging service for security events
 */
import { db } from "../database/index.js";

export interface AuditLogEntry {
  tenantId?: string;
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  status: "success" | "failure";
  errorMessage?: string;
}

export class AuditLogger {
  /**
   * Log an audit event
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await db.query(
        `INSERT INTO audit_log (
          tenant_id, user_id, action, resource_type, resource_id,
          changes, metadata, ip_address, user_agent, status, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          entry.tenantId || null,
          entry.userId || null,
          entry.action,
          entry.resourceType || null,
          entry.resourceId || null,
          entry.changes ? JSON.stringify(entry.changes) : null,
          entry.metadata ? JSON.stringify(entry.metadata) : "{}",
          entry.ipAddress || null,
          entry.userAgent || null,
          entry.status,
          entry.errorMessage || null,
        ],
      );
    } catch (error) {
      // Audit logging should not break the main flow
      console.error("Failed to write audit log:", error);
    }
  }

  /**
   * Query audit logs for a tenant
   */
  async queryByTenant(
    tenantId: string,
    options: {
      limit?: number;
      offset?: number;
      action?: string;
      userId?: string;
      startDate?: Date;
      endDate?: Date;
    } = {},
  ): Promise<any[]> {
    const { limit = 100, offset = 0, action, userId, startDate, endDate } = options;

    let query = "SELECT * FROM audit_log WHERE tenant_id = $1";
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (action) {
      query += ` AND action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }

    if (userId) {
      query += ` AND user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Query audit logs for a user
   */
  async queryByUser(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      action?: string;
      startDate?: Date;
      endDate?: Date;
    } = {},
  ): Promise<any[]> {
    const { limit = 100, offset = 0, action, startDate, endDate } = options;

    let query = "SELECT * FROM audit_log WHERE user_id = $1";
    const params: any[] = [userId];
    let paramIndex = 2;

    if (action) {
      query += ` AND action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Get recent failed login attempts for an IP
   */
  async getFailedLoginAttempts(ipAddress: string, minutes: number = 15): Promise<number> {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM audit_log
       WHERE action = 'user.login_failed'
         AND ip_address = $1
         AND created_at > NOW() - INTERVAL '${minutes} minutes'`,
      [ipAddress],
    );
    return parseInt(result.rows[0].count, 10);
  }
}
