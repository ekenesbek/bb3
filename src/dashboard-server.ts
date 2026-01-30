/**
 * Dashboard API server
 * Simple Express server to serve the dashboard API
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import { db } from "./database/index.js";
import authRoutes from "./auth/routes.js";

// Initialize database
const databaseUrl = process.env.DATABASE_URL || "postgresql://localhost:5432/clawdbot_dev";
const url = new URL(databaseUrl);

db.initialize({
  host: url.hostname,
  port: parseInt(url.port) || 5432,
  database: url.pathname.slice(1), // Remove leading slash
  user: url.username || process.env.USER || "postgres",
  password: url.password || "",
  max: 20,
});

const app = express();
const PORT = process.env.PORT || 3000;

const dashboardOrigins = process.env.DASHBOARD_URL
  ? process.env.DASHBOARD_URL.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : [];

// Middleware
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (dashboardOrigins.length === 0) return callback(null, true);
      if (dashboardOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Auth routes
app.use("/auth", authRoutes);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Dashboard API server running on http://localhost:${PORT}`);
  if (dashboardOrigins.length > 0) {
    console.log(`Dashboard URL(s): ${dashboardOrigins.join(", ")}`);
  } else {
    console.log("Dashboard URL(s): allow all origins (DASHBOARD_URL not set)");
  }
});

export default app;
