import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

// True only while the vendor's premium subscription is valid.
export async function hasActivePremium(vendorId) {
  if (!vendorId) return false;

  const id = String(vendorId);

  const user = await getDB()
    .collection("user")
    .findOne(
      {
        $or: [
          { id },
          ...(ObjectId.isValid(id) ? [{ _id: new ObjectId(id) }] : []),
        ],
      },
      { projection: { subscriptionPlan: 1, subscriptionExpiresAt: 1 } }
    );

  if (!user || user.subscriptionPlan !== "premium") {
    return false;
  }

  if (!user.subscriptionExpiresAt) {
    return false;
  }

  return new Date(user.subscriptionExpiresAt) > new Date();
}

// Count menu items that actually take part in the free-plan limit, i.e. items
// that are approved and available. Rejected/pending/inactive items do not
// count, matching "max 3 active items".
export async function countActiveMenuItems(vendorId) {
  return getDB()
    .collection("menuItems")
    .countDocuments({
      vendorId,
      isApproved: true,
      isAvailable: true,
    });
}

// Record a verified subscription payment. Idempotent per Stripe session so a
// repeated webhook never double-charges or double-activates a plan.
export async function recordSubscriptionTransaction({
  vendorId,
  amount,
  currency,
  stripeSessionId,
  stripeSubscriptionId,
}) {
  const db = getDB();

  await db.collection("transactions").updateOne(
    { stripeSessionId },
    {
      $setOnInsert: {
        transactionId: `SUB-${stripeSessionId}`,
        vendorId,
        type: "subscription",
        plan: "premium",
        amount,
        currency,
        stripeSessionId,
        stripeSubscriptionId,
        status: "completed",
        createdAt: new Date(),
      },
      $set: {
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}