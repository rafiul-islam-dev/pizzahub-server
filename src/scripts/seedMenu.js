import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const client = new MongoClient(process.env.MONGODB_URI);

const samplePizzas = [
  {
    name: "Margherita",
    description: "Classic cheese pizza with fresh tomato and basil.",
    price: 450,
    category: "Classic",
    image: "",
    ingredients: ["Mozzarella", "Tomato", "Basil"],
    isAvailable: true,
    isApproved: true,
    vendorId: "demo-vendor-001",
    createdAt: new Date(),
  },
  {
    name: "Pepperoni Pizza",
    description: "Loaded with pepperoni and mozzarella cheese.",
    price: 650,
    category: "Classic",
    image: "",
    ingredients: ["Pepperoni", "Mozzarella", "Tomato Sauce"],
    isAvailable: true,
    isApproved: true,
    vendorId: "demo-vendor-001",
    createdAt: new Date(),
  },
  {
    name: "BBQ Chicken",
    description: "Smoky BBQ sauce with grilled chicken.",
    price: 750,
    category: "Premium",
    image: "",
    ingredients: ["Chicken", "BBQ Sauce", "Onion", "Cheese"],
    isAvailable: true,
    isApproved: true,
    vendorId: "demo-vendor-002",
    createdAt: new Date(),
  },
  {
    name: "Veggie Supreme",
    description: "Fresh vegetables with delicious cheese.",
    price: 600,
    category: "Vegetarian",
    image: "",
    ingredients: ["Bell Pepper", "Olives", "Onion", "Mushrooms"],
    isAvailable: true,
    isApproved: true,
    vendorId: "demo-vendor-002",
    createdAt: new Date(),
  },
  {
    name: "Four Cheese Pizza",
    description: "A rich combination of four different cheeses.",
    price: 800,
    category: "Premium",
    image: "",
    ingredients: ["Mozzarella", "Cheddar", "Parmesan", "Gouda"],
    isAvailable: true,
    isApproved: true,
    vendorId: "demo-vendor-001",
    createdAt: new Date(),
  },
  {
    name: "Spicy Chicken Pizza",
    description: "Spicy chicken with jalapeno and cheese.",
    price: 700,
    category: "Spicy",
    image: "",
    ingredients: ["Chicken", "Jalapeno", "Chili", "Cheese"],
    isAvailable: true,
    isApproved: true,
    vendorId: "demo-vendor-002",
    createdAt: new Date(),
  },
];

async function seedMenu() {
  try {
    await client.connect();

    const db = client.db(process.env.DB_NAME || "pizzahub");
    const collection = db.collection("menuItems");

    // Avoid inserting duplicates when running the script again
    const existingItems = await collection.countDocuments();

    if (existingItems > 0) {
      console.log("Menu collection already contains data.");
      console.log("Seed cancelled to avoid duplicate records.");
      return;
    }

    const result = await collection.insertMany(samplePizzas);

    console.log(`🍕 ${result.insertedCount} menu items inserted successfully!`);
  } catch (error) {
    console.error("Seed failed:", error.message);
  } finally {
    await client.close();
  }
}

seedMenu();