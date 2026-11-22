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
// GET vendor dashboard statistics
router.get(
  "/dashboard/stats",
  authenticate,
  authorizeRoles("vendor"),
  async (req, res) => {
    try {
      const db = getDB();

      const vendorId = req.user.id;

      const menuItems = db.collection("menuItems");
      const orders = db.collection("orders");

      const [
        totalMenuItems,
        approvedMenuItems,
        pendingMenuItems,
        totalOrders,
        pendingOrders,
        completedOrders,
        revenueResult,
      ] = await Promise.all([
        menuItems.countDocuments({
          vendorId,
        }),

        menuItems.countDocuments({
          vendorId,
          isApproved: true,
        }),

        menuItems.countDocuments({
          vendorId,
          $or: [
            { approvalStatus: "pending" },
            {
              isApproved: false,
              approvalStatus: { $exists: false },
            },
          ],
        }),

        orders.countDocuments({
          vendorId,
        }),

        orders.countDocuments({
          vendorId,
          status: "pending",
        }),

        orders.countDocuments({
          vendorId,
          status: "delivered",
        }),

        orders.aggregate([
          {
            $match: {
              vendorId,
              status: "delivered",
            },
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: "$totalAmount",
              },
            },
          },
        ]).toArray(),
      ]);

      res.json({
        success: true,
        data: {
          totalMenuItems,
          approvedMenuItems,
          pendingMenuItems,
          totalOrders,
          pendingOrders,
          completedOrders,
          revenue: revenueResult[0]?.total || 0,
        },
      });
    } catch (error) {
      console.error("Vendor dashboard stats error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch vendor dashboard statistics",
      });
    }
  }
);
// GET recent vendor orders
router.get(
  "/dashboard/recent-orders",
  authenticate,
  authorizeRoles("vendor"),
  async (req, res) => {
    try {
      const db = getDB();

      const vendorId = req.user.id;

      const recentOrders = await db
        .collection("orders")
        .find({
          vendorId,
        })
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray();

      res.json({
        success: true,
        data: recentOrders,
      });
    } catch (error) {
      console.error("Vendor recent orders error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch recent orders",
      });
    }
  }
);





export default router;

