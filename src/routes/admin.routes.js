
import express from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import authenticate from "../middleware/auth.middleware.js";
import authorizeRoles from "../middleware/role.middleware.js";

const router = express.Router();

// GET: Admin can view vendor applications
router.get(
  "/vendor-applications",
  authenticate,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const status = req.query.status || "pending";

      const allowedStatuses = ["pending", "approved", "rejected"];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid application status",
        });
      }

      const applications = await db
        .collection("vendorApplications")
        .find({ status })
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json({
        success: true,
        data: applications,
      });
    } catch (error) {
      console.error("Get vendor applications error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch vendor applications",
      });
    }
  }
);

// PATCH: Admin approves or rejects an application
router.patch(
  "/vendor-applications/:id",
  authenticate,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid application ID",
        });
      }

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be approved or rejected",
        });
      }

      const db = getDB();

      const applicationId = new ObjectId(id);

      const application = await db
        .collection("vendorApplications")
        .findOne({ _id: applicationId });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Vendor application not found",
        });
      }

      if (application.status !== "pending") {
        return res.status(400).json({
          success: false,
          message: "This application has already been reviewed",
        });
      }

      // Update the application
      const updateResult = await db
        .collection("vendorApplications")
        .updateOne(
          {
            _id: applicationId,
            status: "pending",
          },
          {
            $set: {
              status,
              reviewedAt: new Date(),
              reviewedBy: req.user.id,
              updatedAt: new Date(),
            },
          }
        );

      if (updateResult.modifiedCount === 0) {
        return res.status(409).json({
          success: false,
          message: "Application was already reviewed",
        });
      }

      // If approved, change user's role to vendor
      if (status === "approved") {
        const userUpdate = await db.collection("user").updateOne(
          { id: application.userId },
          {
            $set: {
              role: "vendor",
              vendorStatus: "approved",
              updatedAt: new Date(),
            },
          }
        );

        if (userUpdate.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "User associated with this application was not found",
          });
        }
      } else {
        // Rejected applications remain customers
        await db.collection("user").updateOne(
          { id: application.userId },
          {
            $set: {
              vendorStatus: "rejected",
              updatedAt: new Date(),
            },
          }
        );
      }

      const updatedApplication = await db
        .collection("vendorApplications")
        .findOne({ _id: applicationId });

      return res.status(200).json({
        success: true,
        message:
          status === "approved"
            ? "Vendor application approved successfully"
            : "Vendor application rejected successfully",
        data: updatedApplication,
      });
    } catch (error) {
      console.error("Review vendor application error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to review vendor application",
      });
    }
  }
);

export default router;
