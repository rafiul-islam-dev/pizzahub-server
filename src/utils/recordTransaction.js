// Record a completed transaction the first time an order is delivered.
// Uses the order id as the idempotency key so repeated status updates
// never create duplicate transactions.
export async function recordOrderTransaction(db, order) {
  if (!order?._id) return;

  const now = new Date();

  try {
    await db.collection("transactions").updateOne(
      { orderId: order._id },
      {
        $setOnInsert: {
          transactionId: `TXN-${order._id}`,
          orderId: order._id,
          orderNumber: order.orderNumber || "",
          userId: order.customerId || "",
          userEmail: order.customerEmail || "",
          amount: Number(order.totalAmount) || 0,
          currency: "BDT",
          status: "completed",
          paymentMethod: order.paymentMethod || "cash_on_delivery",
          createdAt: now,
        },
        $set: {
          updatedAt: now,
        },
      },
      { upsert: true }
    );
  } catch (error) {
    // Never fail the order update because the ledger write failed.
    console.error("Record order transaction error:", error);
  }
}
