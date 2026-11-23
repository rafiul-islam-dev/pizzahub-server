import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import authenticate from "../middleware/auth.middleware.js";
import authorizeRoles from "../middleware/role.middleware.js";
import {
  countActiveMenuItems,
  hasActivePremium,
} from "../utils/subscription.js";

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
      location,
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

    if (location !== undefined && typeof location !== "string") {
      return res.status(400).json({
        success: false,
        message: "Location must be a string",
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

    // Free vendors can have a maximum of 3 active (approved + available)
    // items. Premium vendors are unlimited.
    const isPremium = await hasActivePremium(req.user.id);

    if (!isPremium) {
      const activeItemsCount = await countActiveMenuItems(
        req.user.id
      );

      if (activeItemsCount >= 3) {
        return res.status(403).json({
          success: false,
          message:
            "Free vendors can have up to 3 active menu items. Upgrade to Premium for more.",
        });
      }
    }

    // Try to use the vendor's own business details for the location hint.
    const vendor = await db.collection("user").findOne(
      { id: req.user.id },
      { projection: { businessName: 1, address: 1 } }
    );

    const newMenuItem = {
      name: name.trim(),
      description: description.trim(),
      price: parsedPrice,
      category: category.trim(),
      location:
        (typeof location === "string" && location.trim()) ||
        vendor?.address ||
        "",
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

// PATCH: Vendor updates one of their own menu items
router.patch(
  "/:id",
  authenticate,
  authorizeRoles("vendor"),
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

      const menuItem = await db.collection("menuItems").findOne({
        _id: new ObjectId(id),
        vendorId: req.user.id,
      });

      if (!menuItem) {
        return res.status(404).json({
          success: false,
          message: "Menu item not found",
        });
      }

      const { name, description, price, category, image, ingredients, location, isAvailable } =
        req.body;

      const updateFields = { updatedAt: new Date() };

      if (name !== undefined) {
        const trimmed = String(name).trim();

        if (trimmed.length < 2 || trimmed.length > 100) {
          return res.status(400).json({
            success: false,
            message: "Name must be between 2 and 100 characters",
          });
        }

        updateFields.name = trimmed;
      }

      if (description !== undefined) {
        const trimmed = String(description).trim();

        if (trimmed.length < 10 || trimmed.length > 1000) {
          return res.status(400).json({
            success: false,
            message: "Description must be between 10 and 1000 characters",
          });
        }

        updateFields.description = trimmed;
      }

      if (price !== undefined) {
        const parsed = Number(price);

        if (!Number.isFinite(parsed) || parsed <= 0) {
          return res.status(400).json({
            success: false,
            message: "Price must be a valid positive number",
          });
        }

        updateFields.price = parsed;
      }

      if (category !== undefined) {
        updateFields.category = String(category).trim();
      }

      if (location !== undefined) {
        updateFields.location = String(location).trim();
      }

      if (image !== undefined) {
        const trimmedImage = String(image).trim();

        if (trimmedImage) {
          try {
            const imageUrl = new URL(trimmedImage);

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

        updateFields.image = trimmedImage;
      }

      if (ingredients !== undefined) {
        updateFields.ingredients = Array.isArray(ingredients)
          ? ingredients
              .filter((item) => typeof item === "string")
              .map((item) => item.trim())
              .filter(Boolean)
          : [];
      }

      if (typeof isAvailable === "boolean") {
        updateFields.isAvailable = isAvailable;
      }

      // Re-approving after a content change keeps the public menu honest.
      if (
        updateFields.name !== undefined ||
        updateFields.description !== undefined ||
        updateFields.price !== undefined ||
        updateFields.image !== undefined ||
        updateFields.category !== undefined
      ) {
        updateFields.isApproved = false;
        updateFields.approvalStatus = "pending";
      }

      await db
        .collection("menuItems")
        .updateOne({ _id: new ObjectId(id) }, { $set: updateFields });

      const updated = await db
        .collection("menuItems")
        .findOne({ _id: new ObjectId(id) });

      res.status(200).json({
        success: true,
        message: "Menu item updated",
        data: updated,
      });
    } catch (error) {
      console.error("Update vendor menu item error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to update menu item",
      });
    }
  }
);

// DELETE: Vendor deletes one of their own menu items
router.delete(
  "/:id",
  authenticate,
  authorizeRoles("vendor"),
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

      const menuItem = await db.collection("menuItems").findOne({
        _id: new ObjectId(id),
        vendorId: req.user.id,
      });

      if (!menuItem) {
        return res.status(404).json({
          success: false,
          message: "Menu item not found",
        });
      }

      await db.collection("menuItems").deleteOne({ _id: new ObjectId(id) });

      res.status(200).json({
        success: true,
        message: "Menu item deleted",
      });
    } catch (error) {
      console.error("Delete vendor menu item error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to delete menu item",
      });
    }
  }
);

export default router;