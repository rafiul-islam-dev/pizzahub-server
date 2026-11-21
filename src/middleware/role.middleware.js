import { getDB } from "../config/db.js";

export function authorizeRoles(...allowedRoles) {
  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const db = getDB();

      const user = await db.collection("user").findOne({
        id: req.user.id,
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }

      if (user.banned) {
        return res.status(403).json({
          success: false,
          message: "Your account is blocked",
        });
      }

      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission",
        });
      }

      req.user.role = user.role;
      req.user.email = user.email;
      req.user.name = user.name;

      next();
    } catch (error) {
      console.error("Role middleware error:", error);

      return res.status(500).json({
        success: false,
        message: "Authorization failed",
      });
    }
  };
}