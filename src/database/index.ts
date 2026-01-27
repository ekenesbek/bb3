/**
 * Database connection pool and query interface
 */
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

class Database {
  private pool: Pool | null = null;
  private config: DatabaseConfig | null = null;

  /**
   * Initialize database connection pool
   */
  initialize(config: DatabaseConfig): void {
    if (this.pool) {
      throw new Error("Database already initialized");
    }

    this.config = config;
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: config.max ?? 20,
      idleTimeoutMillis: config.idleTimeoutMillis ?? 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis ?? 2000,
    });

    // Handle pool errors
    this.pool.on("error", (err) => {
      console.error("Unexpected database pool error:", err);
    });
  }

  /**
   * Get database pool
   */
  getPool(): Pool {
    if (!this.pool) {
      throw new Error("Database not initialized");
    }
    return this.pool;
  }

  /**
   * Execute a query
   */
  async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[],
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error("Database not initialized");
    }
    return this.pool.query<T>(text, params);
  }

  /**
   * Get a client from the pool for transactions
   */
  async getClient(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error("Database not initialized");
    }
    return this.pool.connect();
  }

  /**
   * Close all database connections
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  /**
   * Check database health
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.query("SELECT 1");
      return true;
    } catch (error) {
      console.error("Database health check failed:", error);
      return false;
    }
  }
}

// Export singleton instance
export const db = new Database();

// Export types
export type { DatabaseConfig, PoolClient, QueryResult, QueryResultRow };
