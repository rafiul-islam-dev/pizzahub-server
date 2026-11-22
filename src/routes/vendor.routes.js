import express from "express";
import { getDB } from "../config/db.js";
import authenticate from "../middleware/auth.middleware.js";
import authorizeRoles from "../middleware/role.middleware.js";

const router = express.Router();

// POST: Submit vendor application
router.post(
  "/applications",
  authenticate,
  authorizeRoles("customer"),
  async (req, res) => {
    try {
      const db = getDB();

      const {
        businessName,
        phone,
        address,
        description,
      } = req.body;

      // Validation
      if (
        !businessName?.trim() ||
        !phone?.trim() ||
        !address?.trim() ||
        !description?.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "All fields are required",
        });
      }

      // Check pending application
      const existingApplication = await db
        .collection("vendorApplications")
        .findOne({
          userId: req.user.id,
          status: "pending",
        });

      if (existingApplication) {
        return res.status(409).json({
          success: false,
          message: "You already have a pending application",
        });
      }

      const application = {
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,

        businessName: businessName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        description: description.trim(),

        status: "pending",

        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await db
        .collection("vendorApplications")
        .insertOne(application);

      return res.status(201).json({
        success: true,
        message: "Vendor application submitted successfully",
        data: {
          ...application,
          _id: result.insertedId,
        },
      });
    } catch (error) {
      console.error("Vendor application error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to submit application",
      });
    }
  }
);
// GET: Get current user's vendor application
router.get(
  "/applications/me",
  authenticate,
  async (req, res) => {
    try {
      const db = getDB();

      const application = await db
        .collection("vendorApplications")
        .findOne(
          { userId: req.user.id },
          { sort: { createdAt: -1 } }
        );

      return res.status(200).json({
        success: true,
        data: application,
      });
    } catch (error) {
      console.error("Get vendor application error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch application",
      });
    }
  }
);

export default router;

