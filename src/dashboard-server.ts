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

// Middleware
app.use(
  cors({
    origin: process.env.DASHBOARD_URL || "http://localhost:5174",
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
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Dashboard API server running on http://localhost:${PORT}`);
  console.log(`Dashboard URL: ${process.env.DASHBOARD_URL || "http://localhost:5174"}`);
});

export default app;
