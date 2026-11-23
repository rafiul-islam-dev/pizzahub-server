import { createRemoteJWKSet, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

// Vercel preview deployments each generate their own JWT signing keys and set
// the token's `iss` to their own URL. A fixed JWKS URL therefore cannot verify
// those tokens. Resolve the JWKS from the token's issuer instead, restricted
// to trusted origins so this cannot be used for SSRF.
const jwksCache = new Map();

function isTrustedOrigin(value) {
  if (!value) return false;

  if (
    process.env.CLIENT_URL &&
    value === process.env.CLIENT_URL
  ) {
    return true;
  }

  if (process.env.AUTH_ISSUER && value === process.env.AUTH_ISSUER) {
    return true;
  }

  if (value === "http://localhost:3000") return true;

  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      (url.hostname === "localhost" ||
        url.hostname.endsWith(".vercel.app"))
    );
  } catch {
    return false;
  }
}

function jwksFor(issuer) {
  if (!jwksCache.has(issuer)) {
    jwksCache.set(
      issuer,
      createRemoteJWKSet(
        new URL(`${issuer.replace(/\/$/, "")}/api/auth/jwks`)
      )
    );
  }

  return jwksCache.get(issuer);
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

    // Read the (unverified) issuer only to locate the correct JWKS. The
    // signature is verified below with that JWKS, so a forged issuer cannot
    // be trusted without a valid signature from that same origin.
    let issuer;
    let audience;

    try {
      const payloadSegment = token.split(".")[1];
      const decoded = JSON.parse(
        Buffer.from(payloadSegment, "base64url").toString("utf8")
      );
      issuer = decoded.iss;
      audience = decoded.aud;
    } catch {
      // handled by the trusted-origin checks below
    }

    if (!isTrustedOrigin(issuer) || !isTrustedOrigin(audience)) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    // Verify signature, expiry and claims using the JWKS of the deployment
    // that issued the token.
    const { payload } = await jwtVerify(token, jwksFor(issuer));

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