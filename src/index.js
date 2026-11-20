import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import healthRoutes from "./routes/health.routes.js";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

// Middleware
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());

// Root route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to PizzaHub API 🍕",
  });
});

// Health check route
app.use("/api/health", healthRoutes);

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🍕 PizzaHub server running on port ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
});