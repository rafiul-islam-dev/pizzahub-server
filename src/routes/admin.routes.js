
import express from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import authenticate from "../middleware/auth.middleware.js";
import authorizeRoles from "../middleware/role.middleware.js";
import { recordOrderTransaction } from "../utils/recordTransaction.js";

const router = express.Router();

// better-auth stores the user's public `id` as the Mongo `_id` (ObjectId),
// so any user reference must be converted before querying the `user` collection.
function toObjectId(value) {
  if (!value) return null;

  if (value instanceof ObjectId) return value;

  if (typeof value === "string" && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }

  return null;
}

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

      // Resolve and validate the applicant *before* mutating the application,
      // otherwise a missing user leaves the application stuck as approved.
      const applicantId = toObjectId(application.userId);

      if (!applicantId) {
        return res.status(400).json({
          success: false,
          message: "Application has an invalid user reference",
        });
      }

      const applicant = await db
        .collection("user")
        .findOne({ _id: applicantId });

      if (!applicant) {
        return res.status(404).json({
          success: false,
          message: "User associated with this application was not found",
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
        await db.collection("user").updateOne(
          { _id: applicantId },
          {
            $set: {
              role: "vendor",
              vendorStatus: "approved",
              updatedAt: new Date(),
            },
          }
        );
      } else {
        // Rejected applications remain customers
        await db.collection("user").updateOne(
          { _id: applicantId },
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

      const users = (
        await usersCollection
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
          .toArray()
      ).map((user) => ({
        ...user,
        id: user._id.toString(),
      }));

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

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

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

      const targetUser = await db
        .collection("user")
        .findOne({ _id: new ObjectId(id) });

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
        { _id: new ObjectId(id) },
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

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

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

      const targetUser = await db
        .collection("user")
        .findOne({ _id: new ObjectId(id) });

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      await db.collection("user").updateOne(
        { _id: new ObjectId(id) },
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

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID",
        });
      }

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

      const updateFields = {
        status,
        updatedAt: new Date(),
        adminUpdatedBy: req.user.id,
      };

      if (status === "delivered") {
        updateFields.deliveredAt = new Date();
        updateFields.paymentStatus = "paid";
      }

      await db.collection("orders").updateOne(
        { _id: new ObjectId(id) },
        {
          $set: updateFields,
        }
      );

      if (status === "delivered") {
        await recordOrderTransaction(db, { ...order, ...updateFields });
      }

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

// GET transaction summary
router.get(
  "/transactions/summary",
  authenticate,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const transactions = db.collection("transactions");

      const summary = await transactions
        .aggregate([
          {
            $group: {
              _id: null,
              totalTransactions: { $sum: 1 },
              totalRevenue: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", "completed"] },
                    "$amount",
                    0,
                  ],
                },
              },
              completedTransactions: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", "completed"] },
                    1,
                    0,
                  ],
                },
              },
              pendingTransactions: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", "pending"] },
                    1,
                    0,
                  ],
                },
              },
              failedTransactions: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", "failed"] },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
        .toArray();

      res.json({
        success: true,
        data: summary[0] || {
          totalTransactions: 0,
          totalRevenue: 0,
          completedTransactions: 0,
          pendingTransactions: 0,
          failedTransactions: 0,
        },
      });
    } catch (error) {
      console.error("Transaction summary error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch transaction summary",
      });
    }
  }
);
// GET all transactions
router.get(
  "/transactions",
  authenticate,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const {
        page = 1,
        limit = 10,
        search = "",
        status = "all",
      } = req.query;

      const currentPage = Math.max(1, Number(page) || 1);
      const perPage = Math.min(50, Math.max(1, Number(limit) || 10));

      const filter = {};

      // Filter by payment status
      if (status !== "all") {
        filter.status = status;
      }

      // Search by transaction ID, user email, or Stripe session
      if (search.trim()) {
        filter.$or = [
          { transactionId: { $regex: search, $options: "i" } },
          { userEmail: { $regex: search, $options: "i" } },
          { stripeSessionId: { $regex: search, $options: "i" } },
        ];
      }

      const collection = db.collection("transactions");

      const [transactions, total] = await Promise.all([
        collection
          .find(filter)
          .sort({ createdAt: -1 })
          .skip((currentPage - 1) * perPage)
          .limit(perPage)
          .toArray(),

        collection.countDocuments(filter),
      ]);

      res.json({
        success: true,
        data: transactions,
        pagination: {
          page: currentPage,
          limit: perPage,
          total,
          totalPages: Math.ceil(total / perPage),
        },
      });
    } catch (error) {
      console.error("Admin transactions error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch transactions",
      });
    }
  }
);
// GET monthly sales analytics
router.get(
  "/analytics/monthly",
  authenticate,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1);
      sixMonthsAgo.setHours(0, 0, 0, 0);

      const result = await db
        .collection("transactions")
        .aggregate([
          {
            $match: {
              status: "completed",
              createdAt: {
                $gte: sixMonthsAgo,
              },
            },
          },
          {
            $group: {
              _id: {
                year: {
                  $year: "$createdAt",
                },
                month: {
                  $month: "$createdAt",
                },
              },
              revenue: {
                $sum: "$amount",
              },
              transactions: {
                $sum: 1,
              },
            },
          },
          {
            $sort: {
              "_id.year": 1,
              "_id.month": 1,
            },
          },
        ])
        .toArray();

      // Fill missing months with zero
      const monthlyData = [];

      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        date.setMonth(date.getMonth() - i);

        const year = date.getFullYear();
        const month = date.getMonth() + 1;

        const existing = result.find(
          (item) =>
            item._id.year === year &&
            item._id.month === month
        );

        monthlyData.push({
          month: date.toLocaleString("en-US", {
            month: "short",
          }),
          year,
          revenue: existing?.revenue || 0,
          transactions: existing?.transactions || 0,
        });
      }

      res.json({
        success: true,
        data: monthlyData,
      });
    } catch (error) {
      console.error("Monthly analytics error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch monthly analytics",
      });
    }
  }
);
// GET admin dashboard statistics
router.get(
  "/dashboard/stats",
  authenticate,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const users = db.collection("user");
      const menuItems = db.collection("menuItems");
      const orders = db.collection("orders");
      const transactions = db.collection("transactions");
      const vendorApplications = db.collection("vendorApplications");

      const [
        totalUsers,
        totalVendors,
        totalMenuItems,
        approvedMenuItems,
        pendingMenuItems,
        totalOrders,
        pendingOrders,
        completedOrders,
        totalRevenue,
        pendingVendorApplications,
      ] = await Promise.all([
        users.countDocuments(),

        users.countDocuments({
          role: "vendor",
          vendorStatus: "approved",
        }),

        menuItems.countDocuments(),

        menuItems.countDocuments({
          isApproved: true,
        }),

        menuItems.countDocuments({
          $or: [
            { approvalStatus: "pending" },
            {
              isApproved: false,
              approvalStatus: { $exists: false },
            },
          ],
        }),

        orders.countDocuments(),

        orders.countDocuments({
          status: "pending",
        }),

        orders.countDocuments({
          status: "delivered",
        }),

        transactions.aggregate([
          {
            $match: {
              status: "completed",
            },
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: "$amount",
              },
            },
          },
        ]).toArray(),

        vendorApplications.countDocuments({
          status: "pending",
        }),
      ]);

      res.json({
        success: true,
        data: {
          totalUsers,
          totalVendors,
          totalMenuItems,
          approvedMenuItems,
          pendingMenuItems,
          totalOrders,
          pendingOrders,
          completedOrders,
          totalRevenue: totalRevenue[0]?.total || 0,
          pendingVendorApplications,
        },
      });
    } catch (error) {
      console.error("Admin dashboard stats error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch dashboard statistics",
      });
    }
  }
);
// GET recent orders for admin dashboard
router.get(
  "/dashboard/recent-orders",
  authenticate,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const db = getDB();

      const recentOrders = await db
        .collection("orders")
        .find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray();

      res.json({
        success: true,
        data: recentOrders,
      });
    } catch (error) {
      console.error("Recent orders error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch recent orders",
      });
    }
  }
);

export default router;
