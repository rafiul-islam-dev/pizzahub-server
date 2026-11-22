
import { Router } from "express";
import { getDB } from "../config/db.js";
import authenticate from "../middleware/auth.middleware.js";
import authorizeRoles from "../middleware/role.middleware.js";

const router = Router();

// GET: Vendor's own menu items
router.get("/", authenticate, authorizeRoles("vendor"), async (req, res) => {
  try {
    const db = getDB();

    const menuItems = await db
      .collection("menuItems")
      .find({ vendorId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: menuItems.length,
      data: menuItems,
    });
  } catch (error) {
    console.error("Get vendor menu error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch your menu items",
    });
  }
});

// POST: Vendor creates a menu item
router.post("/", authenticate, authorizeRoles("vendor"), async (req, res) => {
  try {
    const db = getDB();

    const {
      name,
      description,
      price,
      category,
      image,
      ingredients,
    } = req.body;

    // Validate required fields
    if (!name || !description || price === undefined || !category) {
      return res.status(400).json({
        success: false,
        message: "Name, description, price and category are required",
      });
    }

    const parsedPrice = Number(price);

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "Price must be a valid positive number",
      });
    }

    if (name.trim().length < 2 || name.trim().length > 100) {
      return res.status(400).json({
        success: false,
        message: "Name must be between 2 and 100 characters",
      });
    }

    if (description.trim().length < 10 || description.trim().length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Description must be between 10 and 1000 characters",
      });
    }

    if (category.trim().length > 50) {
      return res.status(400).json({
        success: false,
        message: "Category is too long",
      });
    }

    if (image && typeof image !== "string") {
      return res.status(400).json({
        success: false,
        message: "Image must be a valid URL string",
      });
    }

    if (image) {
      try {
        const imageUrl = new URL(image);

        if (!["http:", "https:"].includes(imageUrl.protocol)) {
          throw new Error("Invalid image URL protocol");
        }
      } catch {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid image URL",
        });
      }
    }

    const cleanIngredients = Array.isArray(ingredients)
      ? ingredients
          .filter((item) => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

    // Free vendors can have a maximum of 3 available menu items
    const activeItemsCount = await db.collection("menuItems").countDocuments({
      vendorId: req.user.id,
      isAvailable: true,
    });

    if (activeItemsCount >= 3) {
      return res.status(403).json({
        success: false,
        message:
          "Free vendors can have up to 3 active menu items. Upgrade to Premium for more.",
      });
    }

    const newMenuItem = {
      name: name.trim(),
      description: description.trim(),
      price: parsedPrice,
      category: category.trim(),
      image: image?.trim() || "",
      ingredients: cleanIngredients,

      // Server determines vendor ownership
      vendorId: req.user.id,

      // New vendor items require admin approval
      isApproved: false,
      isAvailable: true,

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("menuItems").insertOne(newMenuItem);

    res.status(201).json({
      success: true,
      message: "Menu item submitted for approval",
      data: {
        ...newMenuItem,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error("Create vendor menu item error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create menu item",
    });
  }
});

export default router;
