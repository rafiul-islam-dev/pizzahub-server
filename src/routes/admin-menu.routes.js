import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import authenticate from "../middleware/auth.middleware.js";
import authorizeRoles from "../middleware/role.middleware.js";

const router = Router();

// Get menu items for admin review
router.get(
  "/",
  authenticate,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const db = getDB();
      const status = req.query.status || "pending";

      let filter = {};

      if (status === "pending") {
        filter = {
          isApproved: false,
          approvalStatus: { $ne: "rejected" },
        };
      } else if (status === "approved") {
        filter = { isApproved: true };
      } else if (status === "rejected") {
        filter = { approvalStatus: "rejected" };
      } else if (status === "all") {
        filter = {};
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
        });
      }

      const menuItems = await db
        .collection("menuItems")
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();

      return res.status(200).json({
        success: true,
        count: menuItems.length,
        data: menuItems,
      });
    } catch (error) {
      console.error("Admin menu fetch error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch menu items",
      });
    }
  }
);

// Approve or reject a menu item
router.patch(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid menu item ID",
        });
      }

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be approved or rejected",
        });
      }

      const db = getDB();
      const menuItemsCollection = db.collection("menuItems");

      const menuItem = await menuItemsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!menuItem) {
        return res.status(404).json({
          success: false,
          message: "Menu item not found",
        });
      }

      const updateData = {
        approvalStatus: status,
        reviewedAt: new Date(),
        reviewedBy: req.user.id,
        updatedAt: new Date(),
      };

      if (status === "approved") {
        updateData.isApproved = true;
      } else {
        updateData.isApproved = false;
      }

      await menuItemsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );

      return res.status(200).json({
        success: true,
        message:
          status === "approved"
            ? "Menu item approved successfully"
            : "Menu item rejected successfully",
      });
    } catch (error) {
      console.error("Menu review error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to review menu item",
      });
    }
  }
);

// Delete a menu item
router.delete(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid menu item ID",
        });
      }

      const db = getDB();

      const result = await db
        .collection("menuItems")
        .deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Menu item not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Menu item deleted",
      });
    } catch (error) {
      console.error("Delete menu item error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to delete menu item",
      });
    }
  }
);

// Change the published status of a menu item
router.patch(
  "/:id/status",
  authenticate,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isAvailable } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid menu item ID",
        });
      }

      if (typeof isAvailable !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "isAvailable must be a boolean",
        });
      }

      const db = getDB();

      const result = await db
        .collection("menuItems")
        .updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              isAvailable,
              updatedAt: new Date(),
            },
          }
        );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Menu item not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: isAvailable
          ? "Menu item activated"
          : "Menu item deactivated",
      });
    } catch (error) {
      console.error("Update menu item status error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update menu item status",
      });
    }
  }
);

export default router;