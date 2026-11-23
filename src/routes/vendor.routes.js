import express from "express";
import { getDB } from "../config/db.js";
import authenticate from "../middleware/auth.middleware.js";
import authorizeRoles from "../middleware/role.middleware.js";
import { ObjectId } from "mongodb";
import { recordOrderTransaction } from "../utils/recordTransaction.js";

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
// GET: Get vendor orders
router.get(
  "/orders",
  authenticate,
  authorizeRoles("vendor"),
  async (req, res) => {
    try {
      const db = getDB();
      const vendorId = req.user.id;

      const { status } = req.query;

      const allowedStatuses = [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "delivered",
        "rejected",
        "cancelled",
      ];

      const query = { vendorId };

      if (status && status !== "all") {
        if (!allowedStatuses.includes(status)) {
          return res.status(400).json({
            success: false,
            message: "Invalid order status",
          });
        }

        query.status = status;
      }

      const orders = await db
        .collection("orders")
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json({
        success: true,
        data: orders,
      });
    } catch (error) {
      console.error("Get vendor orders error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch vendor orders",
      });
    }
  }
);
// PATCH: Accept or reject a pending order
router.patch(
  "/orders/:id/decision",
  authenticate,
  authorizeRoles("vendor"),
  async (req, res) => {
    try {
      const db = getDB();

      const vendorId = req.user.id;
      const { id } = req.params;
      const { decision, rejectionReason } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID",
        });
      }

      if (!["accepted", "rejected"].includes(decision)) {
        return res.status(400).json({
          success: false,
          message: "Decision must be accepted or rejected",
        });
      }

      const orderId = new ObjectId(id);

      // Check order ownership
      const order = await db.collection("orders").findOne({
        _id: orderId,
        vendorId,
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (order.status !== "pending") {
        return res.status(409).json({
          success: false,
          message: "This order has already been processed",
        });
      }

      const newStatus =
        decision === "accepted" ? "confirmed" : "rejected";

      const updateData = {
        status: newStatus,
        updatedAt: new Date(),
        vendorDecisionAt: new Date(),
      };

      if (decision === "rejected" && rejectionReason?.trim()) {
        updateData.rejectionReason = rejectionReason.trim();
      }

      // Atomic update prevents repeated decisions
      const result = await db.collection("orders").updateOne(
        {
          _id: orderId,
          vendorId,
          status: "pending",
        },
        {
          $set: updateData,
        }
      );

      if (result.modifiedCount === 0) {
        return res.status(409).json({
          success: false,
          message: "Order has already been processed",
        });
      }

      const updatedOrder = await db.collection("orders").findOne({
        _id: orderId,
        vendorId,
      });

      return res.status(200).json({
        success: true,
        message:
          decision === "accepted"
            ? "Order accepted successfully"
            : "Order rejected successfully",
        data: updatedOrder,
      });
    } catch (error) {
      console.error("Vendor order decision error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to process order decision",
      });
    }
  }
);
// PATCH: Update vendor order status
router.patch(
  "/orders/:id/status",
  authenticate,
  authorizeRoles("vendor"),
  async (req, res) => {
    try {
      const db = getDB();
      const vendorId = req.user.id;
      const { id } = req.params;
      const { status } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID",
        });
      }

      // Allowed transitions
      const allowedTransitions = {
        confirmed: ["preparing"],
        preparing: ["ready"],
        ready: ["delivered"],
      };

      const orderId = new ObjectId(id);

      const order = await db.collection("orders").findOne({
        _id: orderId,
        vendorId,
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      const nextStatuses = allowedTransitions[order.status];

      if (!nextStatuses || !nextStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot change order status from ${order.status} to ${status}`,
        });
      }

      const updateFields = {
        status,
        updatedAt: new Date(),
      };

      if (status === "delivered") {
        updateFields.deliveredAt = new Date();
        updateFields.paymentStatus = "paid";
      }

      // Atomic update
      const result = await db.collection("orders").updateOne(
        {
          _id: orderId,
          vendorId,
          status: order.status,
        },
        {
          $set: updateFields,
        }
      );

      if (result.modifiedCount === 0) {
        return res.status(409).json({
          success: false,
          message: "Order status changed. Please refresh.",
        });
      }

      if (status === "delivered") {
        await recordOrderTransaction(db, { ...order, ...updateFields });
      }

      const updatedOrder = await db.collection("orders").findOne({
        _id: orderId,
        vendorId,
      });

      return res.status(200).json({
        success: true,
        message: `Order updated to ${status}`,
        data: updatedOrder,
      });
    } catch (error) {
      console.error("Update vendor order status error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update order status",
      });
    }
  }
);


export default router;

