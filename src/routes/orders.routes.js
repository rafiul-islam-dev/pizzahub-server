import express from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import authenticate from "../middleware/auth.middleware.js";
import authorizeRoles from "../middleware/role.middleware.js";

const router = express.Router();

// POST: Create a customer order
router.post(
  "/",
  authenticate,
  authorizeRoles("customer"),
  async (req, res) => {
    try {
      const db = getDB();

      const {
        items,
        deliveryAddress,
        phone,
        deliveryDate,
        message,
      } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Order must contain at least one item",
        });
      }

      if (!deliveryAddress?.trim() || !phone?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Delivery address and phone are required",
        });
      }

      // Delivery date is required and must be today or later.
      const requestedDate = deliveryDate ? new Date(deliveryDate) : null;

      if (!requestedDate || Number.isNaN(requestedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "A valid delivery date is required",
        });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (requestedDate < today) {
        return res.status(400).json({
          success: false,
          message: "Delivery date cannot be in the past",
        });
      }

      // Validate item IDs and quantities
      for (const item of items) {
        if (
          !ObjectId.isValid(item.menuItemId) ||
          !Number.isInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > 20
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid menu item or quantity",
          });
        }
      }

      // Fetch menu items from database
      const menuItemIds = items.map(
        (item) => new ObjectId(item.menuItemId)
      );

      const menuItems = await db
        .collection("menuItems")
        .find({
          _id: { $in: menuItemIds },
          isApproved: true,
          isAvailable: true,
        })
        .toArray();

      if (menuItems.length !== items.length) {
        return res.status(400).json({
          success: false,
          message: "Some menu items are unavailable",
        });
      }

      // All items must belong to the same vendor
      const vendorIds = [
        ...new Set(menuItems.map((item) => item.vendorId)),
      ];

      if (vendorIds.length !== 1) {
        return res.status(400).json({
          success: false,
          message: "Please order from one restaurant at a time",
        });
      }

      const vendorId = vendorIds[0];

      // Vendor cannot order from their own restaurant
      if (vendorId === req.user.id) {
        return res.status(403).json({
          success: false,
          message: "You cannot order from your own restaurant",
        });
      }

      // A customer cannot order an item they own (vendors ordering their
      // own menu item through their customer account).
      const ownsAnyItem = menuItems.some(
        (menuItem) => String(menuItem.vendorId) === String(req.user.id)
      );

      if (ownsAnyItem) {
        return res.status(403).json({
          success: false,
          message: "You cannot order your own items",
        });
      }

      // Prevent duplicate active orders for the same item and delivery date.
      const orderedMenuItemIds = items.map((item) =>
        String(item.menuItemId)
      );
      const deliveryDateOnly = new Date(requestedDate);
      deliveryDateOnly.setHours(0, 0, 0, 0);

      const nextDay = new Date(deliveryDateOnly);
      nextDay.setDate(nextDay.getDate() + 1);

      const duplicateOrder = await db.collection("orders").findOne({
        customerId: req.user.id,
        status: { $in: ["pending", "confirmed"] },
        "items.menuItemId": {
          $in: orderedMenuItemIds.map((id) => new ObjectId(id)),
        },
        deliveryDate: {
          $gte: deliveryDateOnly,
          $lt: nextDay,
        },
      });

      if (duplicateOrder) {
        return res.status(409).json({
          success: false,
          message:
            "You already have an active order for this item on the selected date",
        });
      }

      // Create order items using trusted database prices
      const orderItems = items.map((requestedItem) => {
        const menuItem = menuItems.find(
          (item) =>
            item._id.toString() === requestedItem.menuItemId
        );

        return {
          menuItemId: menuItem._id,
          name: menuItem.name,
          image: menuItem.image || "",
          price: menuItem.price,
          quantity: requestedItem.quantity,
          subtotal: menuItem.price * requestedItem.quantity,
        };
      });

      const totalAmount = orderItems.reduce(
        (total, item) => total + item.subtotal,
        0
      );

      const order = {
        orderNumber: `PH-${Date.now()}`,

        customerId: req.user.id,
        customerName: req.user.name || "",
        customerEmail: req.user.email,

        vendorId,

        items: orderItems,

        deliveryDate: requestedDate,
        deliveryAddress: deliveryAddress.trim(),
        phone: phone.trim(),
        message: message?.trim() || "",

        totalAmount,

        status: "pending",
        paymentMethod: "cash_on_delivery",
        paymentStatus: "unpaid",

        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await db
        .collection("orders")
        .insertOne(order);

      return res.status(201).json({
        success: true,
        message: "Order placed successfully",
        data: {
          ...order,
          _id: result.insertedId,
        },
      });
    } catch (error) {
      console.error("Create order error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create order",
      });
    }
  }
);
// GET: Customer order statistics
router.get(
  "/stats",
  authenticate,
  authorizeRoles("customer"),
  async (req, res) => {
    try {
      const db = getDB();

      const orders = await db
        .collection("orders")
        .find({ customerId: req.user.id })
        .toArray();

      const counts = {
        total: orders.length,
        pending: 0,
        accepted: 0,
        rejected: 0,
        cancelled: 0,
        delivered: 0,
      };

      orders.forEach((order) => {
        const status = String(order.status || "").toLowerCase();

        if (status === "pending") counts.pending += 1;
        else if (
          status === "accepted" ||
          status === "confirmed"
        )
          counts.accepted += 1;
        else if (status === "rejected") counts.rejected += 1;
        else if (status === "cancelled") counts.cancelled += 1;
        else if (status === "delivered") counts.delivered += 1;
      });

      return res.status(200).json({
        success: true,
        data: counts,
      });
    } catch (error) {
      console.error("Order stats error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch order statistics",
      });
    }
  }
);
// GET: Get customer's orders
router.get(
  "/my",
  authenticate,
  authorizeRoles("customer"),
  async (req, res) => {
    try {
      const db = getDB();

      const orders = await db
        .collection("orders")
        .find({ customerId: req.user.id })
        .sort({ createdAt: -1 })
        .toArray();

      return res.json({
        success: true,
        data: orders,
      });
    } catch (error) {
      console.error("Get customer orders error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch orders",
      });
    }
  }
);
// PATCH: Cancel pending customer order
router.patch(
  "/:id/cancel",
  authenticate,
  authorizeRoles("customer"),
  async (req, res) => {
    try {
      const db = getDB();
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID",
        });
      }

      const result = await db.collection("orders").updateOne(
        {
          _id: new ObjectId(id),
          customerId: req.user.id,
          status: "pending",
        },
        {
          $set: {
            status: "cancelled",
            updatedAt: new Date(),
          },
        }
      );

      if (!result.modifiedCount) {
        return res.status(404).json({
          success: false,
          message: "Order not found or cannot be cancelled",
        });
      }

      return res.json({
        success: true,
        message: "Order cancelled successfully",
      });
    } catch (error) {
      console.error("Cancel order error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to cancel order",
      });
    }
  }
);

export default router;