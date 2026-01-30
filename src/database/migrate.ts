/**
 * Database migration runner
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db } from "./index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function runMigrations(): Promise<void> {
  console.log("Running database migrations...");

  try {
    // Read schema file
    const schemaPath = join(__dirname, "schema.sql");
    const schema = readFileSync(schemaPath, "utf-8");

    // Execute schema
    await db.query(schema);

    console.log("✓ Migrations completed successfully");
  } catch (error) {
    console.error("✗ Migration failed:", error);
    throw error;
  }
}

// CLI runner
if (import.meta.url === `file://${process.argv[1]}`) {
  void (async () => {
    try {
      // Initialize database connection
      db.initialize({
        host: process.env.DATABASE_HOST || "localhost",
        port: parseInt(process.env.DATABASE_PORT || "5432"),
        database: process.env.DATABASE_NAME || "clawdbot",
        user: process.env.DATABASE_USER || "postgres",
        password: process.env.DATABASE_PASSWORD || "",
      });

      await runMigrations();
      await db.close();
      process.exit(0);
    } catch (error) {
      console.error("Migration script failed:", error);
      process.exit(1);
    }
  })();
}
