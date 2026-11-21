import { Router } from "express";
import { getDB } from "../config/db.js";

const router = Router();

// GET all approved and available menu items
router.get("/", async (req, res) => {
  try {
    const db = getDB();

    const menuItems = await db
      .collection("menuItems")
      .find({
        isApproved: true,
        isAvailable: true,
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: menuItems.length,
      data: menuItems,
    });
  } catch (error) {
    console.error("Get menu error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch menu items",
    });
  }
});

// GET single menu item by ID
router.get("/:id", async (req, res) => {
  try {
    const db = getDB();

    const { ObjectId } = await import("mongodb");

    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }

    const menuItem = await db.collection("menuItems").findOne({
      _id: new ObjectId(req.params.id),
      isApproved: true,
      isAvailable: true,
    });

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found",
      });
    }

    res.status(200).json({
      success: true,
      data: menuItem,
    });
  } catch (error) {
    console.error("Get menu item error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch menu item",
    });
  }
});

export default router;