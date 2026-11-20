import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || "pizzahub";

if (!uri) {
  throw new Error("MONGODB_URI is missing from environment variables");
}

const client = new MongoClient(uri);

let database;

export async function connectDB() {
  try {
    await client.connect();

    database = client.db(dbName);

    // Verify database connection
    await database.command({ ping: 1 });

    console.log("✅ MongoDB connected successfully!");
    console.log(`📦 Database: ${dbName}`);

    return database;
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    throw error;
  }
}

export function getDB() {
  if (!database) {
    throw new Error("Database is not connected yet!");
  }

  return database;
}