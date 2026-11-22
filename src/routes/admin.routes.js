
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

// GET all users
router.get(
  "/users",
  authenticate,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
      const search = (req.query.search || "").trim();
      const role = req.query.role || "";

      const filter = {};

      if (role && ["customer", "vendor", "admin"].includes(role)) {
        filter.role = role;
      }

      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }

      const usersCollection = db.collection("user");

      const total = await usersCollection.countDocuments(filter);

      const users = await usersCollection
        .find(filter)
        .project({
          name: 1,
          email: 1,
          role: 1,
          image: 1,
          isActive: 1,
          vendorStatus: 1,
          createdAt: 1,
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();

      return res.status(200).json({
        success: true,
        data: users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Admin users fetch error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch users",
      });
    }
  }
);

// Update user role
router.patch(
  "/users/:id/role",
  authenticate,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!["customer", "vendor", "admin"].includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role",
        });
      }

      if (id === req.user.id) {
        return res.status(400).json({
          success: false,
          message: "You cannot change your own role",
        });
      }

      const db = getDB();

      const targetUser = await db.collection("user").findOne({ id });

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Vendor role must be earned through application approval.
      if (
        role === "vendor" &&
        targetUser.vendorStatus !== "approved"
      ) {
        return res.status(400).json({
          success: false,
          message: "This user has not been approved as a vendor",
        });
      }

      await db.collection("user").updateOne(
        { id },
        {
          $set: {
            role,
            updatedAt: new Date(),
          },
        }
      );

      return res.status(200).json({
        success: true,
        message: "User role updated successfully",
      });
    } catch (error) {
      console.error("Role update error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update user role",
      });
    }
  }
);

// Activate / suspend user
router.patch(
  "/users/:id/status",
  authenticate,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "isActive must be a boolean",
        });
      }

      if (id === req.user.id) {
        return res.status(400).json({
          success: false,
          message: "You cannot suspend your own account",
        });
      }

      const db = getDB();

      const targetUser = await db.collection("user").findOne({ id });

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      await db.collection("user").updateOne(
        { id },
        {
          $set: {
            isActive,
            updatedAt: new Date(),
          },
        }
      );

      return res.status(200).json({
        success: true,
        message: isActive
          ? "User activated successfully"
          : "User suspended successfully",
      });
    } catch (error) {
      console.error("User status update error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update user status",
      });
    }
  }
);

// GET all orders
router.get(
  "/orders",
  authenticate,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(
        50,
        Math.max(1, Number(req.query.limit) || 10)
      );

      const status = req.query.status || "";
      const search = (req.query.search || "").trim();

      const filter = {};

      const allowedStatuses = [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "delivered",
        "cancelled",
        "rejected",
      ];

      if (status && allowedStatuses.includes(status)) {
        filter.status = status;
      }

      if (search) {
        filter.$or = [
          { orderNumber: { $regex: search, $options: "i" } },
          { customerName: { $regex: search, $options: "i" } },
          { customerEmail: { $regex: search, $options: "i" } },
        ];
      }

      const ordersCollection = db.collection("orders");

      const total = await ordersCollection.countDocuments(filter);

      const orders = await ordersCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();

      return res.status(200).json({
        success: true,
        data: orders,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Admin orders fetch error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch orders",
      });
    }
  }
);

// Update order status by admin
router.patch(
  "/orders/:id/status",
  authenticate,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const allowedStatuses = [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "delivered",
        "cancelled",
        "rejected",
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order status",
        });
      }

      const db = getDB();

      const order = await db.collection("orders").findOne({
        _id: new ObjectId(id),
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      await db.collection("orders").updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status,
            updatedAt: new Date(),
            adminUpdatedBy: req.user.id,
          },
        }
      );

      return res.status(200).json({
        success: true,
        message: "Order status updated successfully",
      });
    } catch (error) {
      console.error("Admin order status update error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update order status",
      });
    }
  }
);
// GET single order details
router.get(
  "/orders/:id",
  authenticate,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID",
        });
      }

      const db = getDB();

      const order = await db.collection("orders").findOne({
        _id: new ObjectId(id),
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: order,
      });
    } catch (error) {
      console.error("Order details error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch order details",
      });
    }
  }
);

export default router;
