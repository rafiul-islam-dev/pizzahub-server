import express from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import authenticate from "../middleware/auth.middleware.js";

const router = express.Router();

const ALLOWED_FIELDS = [
  "name",
  "image",
  "businessName",
  "phone",
  "address",
];

// GET: Current user's profile
router.get("/me", authenticate, async (req, res) => {
  try {
    const db = getDB();

    const user = await db.collection("user").findOne(
      {
        $or: [
          { id: req.user.id },
          ...(ObjectId.isValid(req.user.id)
            ? [{ _id: new ObjectId(req.user.id) }]
            : []),
        ],
      },
      {
        projection: {
          name: 1,
          email: 1,
          image: 1,
          role: 1,
          businessName: 1,
          phone: 1,
          address: 1,
          subscriptionPlan: 1,
          subscriptionExpiresAt: 1,
          isActive: 1,
          isBlocked: 1,
          createdAt: 1,
        },
      }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Get profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
    });
  }
});

// PATCH: Update editable profile fields only.
router.patch("/me", authenticate, async (req, res) => {
  try {
    const db = getDB();

    const updateFields = { updatedAt: new Date() };

    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) {
        const value = req.body[field];

        if (typeof value !== "string") {
          return res.status(400).json({
            success: false,
            message: `${field} must be a string`,
          });
        }

        updateFields[field] = value.trim();
      }
    }

    // Never allow role, subscription or moderation fields to be touched here.
    if (
      req.body.role !== undefined ||
      req.body.subscriptionPlan !== undefined ||
      req.body.subscriptionExpiresAt !== undefined ||
      req.body.isActive !== undefined ||
      req.body.isBlocked !== undefined
    ) {
      return res.status(403).json({
        success: false,
        message: "You cannot change your role or subscription status",
      });
    }

    await db
      .collection("user")
      .updateOne(
        {
          $or: [
            { id: req.user.id },
            ...(ObjectId.isValid(req.user.id)
              ? [{ _id: new ObjectId(req.user.id) }]
              : []),
          ],
        },
        { $set: updateFields }
      );

    const updated = await db.collection("user").findOne(
      {
        $or: [
          { id: req.user.id },
          ...(ObjectId.isValid(req.user.id)
            ? [{ _id: new ObjectId(req.user.id) }]
            : []),
        ],
      },
      {
        projection: {
          name: 1,
          email: 1,
          image: 1,
          role: 1,
          businessName: 1,
          phone: 1,
          address: 1,
          subscriptionPlan: 1,
          subscriptionExpiresAt: 1,
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Update profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
    });
  }
});

export default router;