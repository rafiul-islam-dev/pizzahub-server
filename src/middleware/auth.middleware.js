import { createRemoteJWKSet, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

// All deployments share the same MongoDB, so Better Auth's JWKS keys are the
// same everywhere. Use one stable JWKS URL (the production client) and verify
// signature + expiry. Issuer/audience are checked loosely because Vercel
// preview deployments sign with their own deployment URL.
const configuredJwksUrl = process.env.AUTH_JWKS_URL;

const JWKS_URL =
  configuredJwksUrl && !configuredJwksUrl.includes("localhost")
    ? configuredJwksUrl
    : "https://pizzahub-client-chgd.vercel.app/api/auth/jwks";

const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

function isTrustedOrigin(value) {
  if (!value) return false;

  if (value === "http://localhost:3000") return true;

  if (process.env.CLIENT_URL && value === process.env.CLIENT_URL) {
    return true;
  }

  try {
    const url = new URL(value);

    return (
      (url.protocol === "https:" || url.hostname === "localhost") &&
      (url.hostname === "localhost" ||
        url.hostname.endsWith(".vercel.app"))
    );
  } catch {
    return false;
  }
}

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

    let issuer;
    let audience;

    try {
      const decoded = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString("utf8")
      );
      issuer = decoded.iss;
      audience = decoded.aud;
    } catch {
      // verified below
    }

    if (!isTrustedOrigin(issuer) || !isTrustedOrigin(audience)) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    // Verify signature and expiry only. Keys come from the shared JWKS.
    const { payload } = await jwtVerify(token, JWKS);

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

    if (
      user.isActive === false ||
      user.banned === true ||
      user.isBlocked === true
    ) {
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