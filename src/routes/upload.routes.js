import express from "express";
import { getDB } from "../config/db.js";
import authenticate from "../middleware/auth.middleware.js";
import authorizeRoles from "../middleware/role.middleware.js";

const router = express.Router();

// POST: Upload an image to ImgBB and return its URL.
router.post(
  "/image",
  authenticate,
  authorizeRoles("vendor", "admin", "customer"),
  async (req, res) => {
    const apiKey = process.env.IMGBB_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message:
          "ImgBB is not configured. Set IMGBB_API_KEY in the server environment.",
      });
    }

    const { image } = req.body || {};

    if (typeof image !== "string" || !image.trim()) {
      return res.status(400).json({
        success: false,
        message: "Image data is required",
      });
    }

    // Accept a data URL or a bare base64 string.
    const base64 = image.includes(",")
      ? image.split(",").pop()
      : image;

    try {
      const form = new URLSearchParams();
      form.append("key", apiKey);
      form.append("image", base64);

      const response = await fetch(
        "https://api.imgbb.com/1/upload",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form.toString(),
        }
      );

      const result = await response.json();

      if (!response.ok || !result?.data?.url) {
        throw new Error(
          result?.error?.message || "ImgBB upload failed"
        );
      }

      return res.status(200).json({
        success: true,
        data: {
          url: result.data.url,
          displayUrl: result.data.display_url || result.data.url,
        },
      });
    } catch (error) {
      console.error("ImgBB upload error:", error.message);

      return res.status(500).json({
        success: false,
        message: error.message || "Failed to upload image",
      });
    }
  }
);

export default router;