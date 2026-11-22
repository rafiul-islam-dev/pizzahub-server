
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

const JWKS = createRemoteJWKSet(
  new URL(process.env.AUTH_JWKS_URL)
);

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication token missing",
      });
    }

    const token = authHeader.slice(7);

    const verifyOptions = {};

    if (process.env.AUTH_ISSUER) {
      verifyOptions.issuer = process.env.AUTH_ISSUER;
    }

    if (process.env.AUTH_AUDIENCE) {
      verifyOptions.audience = process.env.AUTH_AUDIENCE;
    }

    const { payload } = await jwtVerify(
      token,
      JWKS,
      verifyOptions
    );

    if (!payload.sub) {
      return res.status(401).json({
        success: false,
        message: "Token subject missing",
      });
    }

    const db = getDB();

    const userId = payload.sub;

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
        message: "User account not found",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended",
      });
    }

    req.user = {
      id: user.id || user._id?.toString() || userId,
      email: user.email || payload.email || "",
      name: user.name || "",
      role: user.role || "customer",
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

export default authenticate;
