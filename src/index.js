import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { connectDB } from "./config/db.js";
import healthRoutes from "./routes/health.routes.js";
import menuRoutes from "./routes/menu.routes.js";
import vendorRoutes from "./routes/vendor.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import vendorMenuRoutes from "./routes/vendor-menu.routes.js";
import adminMenuRoutes from "./routes/admin-menu.routes.js";
import paymentsRoutes from "./routes/payments.routes.js";
import orderRoutes from "./routes/orders.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import uploadRoutes from "./routes/upload.routes.js";

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

// Stripe webhook must receive the raw body, so it is mounted before the
// global express.json() middleware. `payments.routes.js` itself attaches
// express.raw() to the webhook route.
app.use("/api/payments", paymentsRoutes);

app.use(express.json());


// Root route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to PizzaHub API 🍕",
  });
});

// Health check
app.use("/api/health", healthRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/vendor", vendorRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/vendor/menu", vendorMenuRoutes);
app.use("/api/admin/menu-items", adminMenuRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/upload", uploadRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

// Start server after DB connection
async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`🍕 PizzaHub server running on port ${PORT}`);
      console.log(`🌐 http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();