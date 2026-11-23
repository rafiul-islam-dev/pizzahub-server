import { Router } from "express";
import { getDB } from "../config/db.js";
import { ObjectId } from "mongodb";

const router = Router();

// GET all approved and available menu items
router.get("/", async (req, res) => {
  try {
    const db = getDB();

    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "").trim();
    const location = String(req.query.location || "").trim();
    const sort = String(req.query.sort || "").trim();

    const filter = {
      isApproved: true,
      isAvailable: true,
    };

    if (category && category !== "All") {
      filter.category = category;
    }

    if (location && location !== "All") {
      filter.location = { $regex: location, $options: "i" };
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }

    const menuItems = await db
      .collection("menuItems")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    // Enrich with vendor details and premium placement.
    const vendorIds = [
      ...new Set(menuItems.map((item) => item.vendorId)),
    ];

    const vendors = await db
      .collection("user")
      .find({
        $or: [
          { id: { $in: vendorIds } },
          {
            _id: {
              $in: vendorIds.filter((id) =>
                /^[a-f\d]{24}$/i.test(id)
              ),
            },
          },
        ],
      })
      .toArray();

    const vendorMap = new Map(
      vendors.map((vendor) => [
        String(vendor.id || vendor._id),
        vendor,
      ])
    );

    const enriched = menuItems.map((item) => {
      const vendor = vendorMap.get(String(item.vendorId));

      const isPremium =
        vendor?.subscriptionPlan === "premium" &&
        vendor?.subscriptionExpiresAt &&
        new Date(vendor.subscriptionExpiresAt) > new Date();

      return {
        ...item,
        itemName: item.name,
        status: item.isApproved
          ? "approved"
          : item.approvalStatus || "pending",
        images: Array.isArray(item.images)
          ? item.images
          : item.image
          ? [item.image]
          : [],
        vendorName:
          vendor?.businessName || vendor?.name || "PizzaHub Vendor",
        vendorImage: vendor?.image || "",
        vendorPremium: Boolean(isPremium),
        location: item.location || vendor?.address || "",
      };
    });

    // Premium vendors first, then by newest.
    enriched.sort((a, b) => {
      if (a.vendorPremium !== b.vendorPremium) {
        return a.vendorPremium ? -1 : 1;
      }

      return (
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
      );
    });

    // Optional server-side sorting by price.
    if (sort === "price-low") {
      enriched.sort((a, b) => a.price - b.price);
    } else if (sort === "price-high") {
      enriched.sort((a, b) => b.price - a.price);
    } else if (sort === "name") {
      enriched.sort((a, b) => a.name.localeCompare(b.name));
    }

    res.status(200).json({
      success: true,
      count: enriched.length,
      data: enriched,
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

    const vendor = await db.collection("user").findOne({
      $or: [
        { id: menuItem.vendorId },
        {
          _id: /^[a-f\d]{24}$/i.test(menuItem.vendorId)
            ? menuItem.vendorId
            : "__invalid__",
        },
      ],
    });

    const isPremium =
      vendor?.subscriptionPlan === "premium" &&
      vendor?.subscriptionExpiresAt &&
      new Date(vendor.subscriptionExpiresAt) > new Date();

    res.status(200).json({
      success: true,
      data: {
        ...menuItem,
        itemName: menuItem.name,
        status: "approved",
        images: Array.isArray(menuItem.images)
          ? menuItem.images
          : menuItem.image
          ? [menuItem.image]
          : [],
        vendorName:
          vendor?.businessName || vendor?.name || "PizzaHub Vendor",
        vendorImage: vendor?.image || "",
        vendorPremium: Boolean(isPremium),
        location:
          menuItem.location || vendor?.address || "",
      },
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