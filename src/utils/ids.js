import { ObjectId } from "mongodb";

// Same rules the rest of the app uses when it stores a user reference
// (vendorId, customerId, userId, ...). Anything else is a caller bug and is
// rejected so we never write an id nothing can resolve.
export function normalizeUserId(value) {
  return String(value || "");
}

export function isUserId(value) {
  const id = normalizeUserId(value);

  if (!id) return false;

  // Known vendor fixtures created by the seed script.
  if (id.startsWith("demo-vendor-")) return true;

  return /^[a-f\d]{24}$/i.test(id);
}

export function toObjectId(value) {
  const id = normalizeUserId(value);

  if (!ObjectId.isValid(id)) {
    return null;
  }

  return new ObjectId(id);
}