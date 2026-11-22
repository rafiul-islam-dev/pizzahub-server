import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(
  new URL(process.env.AUTH_JWKS_URL)
);

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const token = authHeader.split(" ")[1];

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.AUTH_ISSUER,
      audience: process.env.AUTH_AUDIENCE,
    });

    if (!payload.sub) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    req.user = {
      id: payload.sub,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

export default authenticate;