import express from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import authenticate from "../middleware/auth.middleware.js";
import authorizeRoles from "../middleware/role.middleware.js";
import { recordSubscriptionTransaction } from "../utils/subscription.js";

const router = express.Router();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
const STRIPE_PREMIUM_AMOUNT = Number(
  process.env.STRIPE_PREMIUM_AMOUNT || 1999
);

function stripeHeaders() {
  return {
    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

function encodeForm(params, prefix = "") {
  const parts = [];

  function walk(key, value) {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        walk(`${key}[${index}]`, item);
      });
      return;
    }

    if (typeof value === "object") {
      Object.entries(value).forEach(([childKey, childValue]) => {
        walk(`${key}[${childKey}]`, childValue);
      });
      return;
    }

    parts.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    );
  }

  Object.entries(params).forEach(([key, value]) => {
    walk(key, value);
  });

  return parts.join("&");
}

// POST: Create a Stripe Checkout session for the premium plan.
router.post(
  "/checkout",
  authenticate,
  authorizeRoles("vendor"),
  async (req, res) => {
    if (!STRIPE_SECRET_KEY) {
      return res.status(503).json({
        success: false,
        message:
          "Stripe is not configured. Set STRIPE_SECRET_KEY in the server environment.",
      });
    }

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
            subscriptionPlan: 1,
            subscriptionExpiresAt: 1,
            stripeCustomerId: 1,
          },
        }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const alreadyPremium =
        user.subscriptionPlan === "premium" &&
        user.subscriptionExpiresAt &&
        new Date(user.subscriptionExpiresAt) > new Date();

      if (alreadyPremium) {
        return res.status(409).json({
          success: false,
          message: "You already have an active premium subscription",
        });
      }

      const lineItems = STRIPE_PRICE_ID
        ? [{ price: STRIPE_PRICE_ID, quantity: 1 }]
        : [
            {
              "price_data[currency]": "usd",
              "price_data[unit_amount]": STRIPE_PREMIUM_AMOUNT,
              "price_data[product_data][name]":
                "PizzaHub Premium Vendor",
              "price_data[product_data][description]":
                "Unlimited active menu items, premium badge and featured placement",
              quantity: 1,
            },
          ];

      const params = {
        mode: "subscription",
        "line_items[0][price]": STRIPE_PRICE_ID || undefined,
        "line_items[0][quantity]": STRIPE_PRICE_ID ? 1 : undefined,
        "success_url": `${CLIENT_URL}/dashboard/vendor/subscription?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        "cancel_url": `${CLIENT_URL}/dashboard/vendor/subscription?payment=cancelled`,
        "client_reference_id": req.user.id,
        "metadata[userId]": req.user.id,
        "metadata[plan]": "premium",
        "subscription_data[metadata][userId]": req.user.id,
        "subscription_data[metadata][plan]": "premium",
      };

      if (STRIPE_PRICE_ID) {
        params["line_items[0][price]"] = STRIPE_PRICE_ID;
        params["line_items[0][quantity]"] = 1;
      } else {
        params["line_items[0][price_data][currency]"] = "usd";
        params["line_items[0][price_data][unit_amount]"] =
          STRIPE_PREMIUM_AMOUNT;
        params["line_items[0][price_data][product_data][name]"] =
          "PizzaHub Premium Vendor";
        params["line_items[0][price_data][product_data][description]"] =
          "Unlimited active menu items, premium badge and featured placement";
        params["line_items[0][quantity]"] = 1;
      }

      if (user.stripeCustomerId) {
        params.customer = user.stripeCustomerId;
      }

      const response = await fetch(
        "https://api.stripe.com/v1/checkout/sessions",
        {
          method: "POST",
          headers: stripeHeaders(),
          body: encodeForm(params),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error?.message || "Stripe checkout failed"
        );
      }

      return res.status(200).json({
        success: true,
        id: data.id,
        url: data.url,
      });
    } catch (error) {
      console.error("Stripe checkout error:", error.message);

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Could not create the checkout session. Please try again.",
      });
    }
  }
);

// GET: Return the current user's subscription details.
router.get(
  "/subscription",
  authenticate,
  authorizeRoles("vendor"),
  async (req, res) => {
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
            subscriptionPlan: 1,
            subscriptionExpiresAt: 1,
            businessName: 1,
          },
        }
      );

      const isPremium =
        user?.subscriptionPlan === "premium" &&
        user?.subscriptionExpiresAt &&
        new Date(user.subscriptionExpiresAt) > new Date();

      return res.status(200).json({
        success: true,
        data: {
          plan: isPremium ? "premium" : "free",
          isPremium: Boolean(isPremium),
          subscriptionExpiresAt: user?.subscriptionExpiresAt || null,
          businessName: user?.businessName || "",
        },
      });
    } catch (error) {
      console.error("Get subscription error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch subscription",
      });
    }
  }
);

function verifyStripeSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;

  const parts = signature.split(",").reduce((acc, pair) => {
    const [key, value] = pair.split("=");

    if (key && value) {
      acc[key] = value;
    }

    return acc;
  }, {});

  const timestamp = parts.t;
  const signatures = signature
    .split(",")
    .filter((item) => item.startsWith("v1="))
    .map((item) => item.slice(3));

  if (!timestamp || signatures.length === 0) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return signatures.some((candidate) => {
    try {
      return timingSafeEqual(
        Buffer.from(candidate, "hex"),
        Buffer.from(expected, "hex")
      );
    } catch {
      return false;
    }
  });
}

// POST: Stripe webhook. This is the ONLY place a subscription is activated.
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    if (!STRIPE_WEBHOOK_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Webhook is not configured",
      });
    }

    const rawBody = req.body.toString("utf8");
    const signature = req.headers["stripe-signature"];

    if (!verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Stripe signature",
      });
    }

    let event;

    try {
      event = JSON.parse(rawBody);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook payload",
      });
    }

    try {
      const db = getDB();

      if (
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded"
      ) {
        const session = event.data.object || {};

        const userId =
          session.metadata?.userId ||
          session.client_reference_id;

        if (!userId) {
          return res.json({ received: true });
        }

        // Activate premium for both subscription and one-time payment checkouts.
        if (session.mode && session.mode !== "subscription" && session.mode !== "payment") {
          return res.json({ received: true });
        }

        const amount =
          session.amount_total != null
            ? session.amount_total / 100
            : 0;

        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        await db.collection("user").updateOne(
          {
            $or: [
              { id: userId },
              ...(ObjectId.isValid(userId)
                ? [{ _id: new ObjectId(userId) }]
                : []),
            ],
          },
          {
            $set: {
              subscriptionPlan: "premium",
              subscriptionExpiresAt: expiresAt,
              stripeCustomerId: session.customer || "",
              stripeSubscriptionId: session.subscription || "",
              updatedAt: new Date(),
            },
          }
        );

        await recordSubscriptionTransaction({
          vendorId: userId,
          amount,
          currency: (session.currency || "usd").toUpperCase(),
          stripeSessionId: session.id,
          stripeSubscriptionId: session.subscription || "",
        });
      }

      if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object || {};
        const userId = subscription.metadata?.userId;

        if (userId) {
          await db.collection("user").updateOne(
            {
              $or: [
                { id: userId },
                ...(ObjectId.isValid(userId)
                  ? [{ _id: new ObjectId(userId) }]
                  : []),
              ],
            },
            {
              $set: {
                subscriptionPlan: "free",
                subscriptionExpiresAt: null,
                stripeSubscriptionId: "",
                updatedAt: new Date(),
              },
            }
          );
        }
      }

      if (event.type === "invoice.payment_failed") {
        const invoice = event.data.object || {};
        const userId =
          invoice.subscription_details?.metadata?.userId;

        if (userId) {
          await db.collection("user").updateOne(
            {
              $or: [
                { id: userId },
                ...(ObjectId.isValid(userId)
                  ? [{ _id: new ObjectId(userId) }]
                  : []),
              ],
            },
            {
              $set: {
                subscriptionPlan: "free",
                subscriptionExpiresAt: null,
                updatedAt: new Date(),
              },
            }
          );
        }
      }

      return res.json({ received: true });
    } catch (error) {
      console.error("Stripe webhook handler error:", error);

      return res.status(500).json({
        success: false,
        message: "Webhook handler failed",
      });
    }
  }
);

export default router;