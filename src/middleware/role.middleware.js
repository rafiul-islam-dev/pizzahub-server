import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

export default function authorizeRoles(...allowedRoles) {
  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const db = getDB();
      const userId = req.user.id;

      const possibleIds = [{ id: userId }, { _id: userId }];

      if (ObjectId.isValid(userId)) {
        possibleIds.push({
          _id: new ObjectId(userId),
        });
      }

      const user = await db.collection("user").findOne({
        $or: possibleIds,
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }

      if (
        user.banned === true ||
        user.isBlocked === true ||
        user.isActive === false
      ) {
        return res.status(403).json({
          success: false,
          message: "Your account has been suspended",
        });
      }

      const role = user.role || "customer";

      if (!allowedRoles.includes(role)) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission",
        });
      }

      req.user.role = role;
      req.user.email = user.email;
      req.user.name = user.name;

      next();
    } catch (error) {
      console.error("Role authorization error:", error);

      return res.status(500).json({
        success: false,
        message: "Role authorization failed",
      });
    }
  };
}