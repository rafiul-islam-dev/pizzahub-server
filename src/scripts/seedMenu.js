import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const client = new MongoClient(process.env.MONGODB_URI);

const IMG = (id) =>
  `https://images.unsplash.com/${id}?w=600&q=80&fit=crop`;

const samplePizzas = [
  {
    name: "Margherita",
    description: "Classic cheese pizza with fresh tomato and basil.",
    price: 450,
    category: "Classic Pizzas",
    image: IMG("photo-1574071318508-1cdbab80d002"),
    ingredients: ["Mozzarella", "Tomato", "Basil"],
    isAvailable: true,
    isApproved: true,
    approvalStatus: "approved",
    vendorId: "demo-vendor-001",
    vendorName: "Bonita Pizza",
    location: "Brooklyn, NY",
    createdAt: new Date(),
  },
  {
    name: "Pepperoni Pizza",
    description: "Loaded with pepperoni and mozzarella cheese.",
    price: 650,
    category: "Meat Lovers",
    image: IMG("photo-1628840042765-356cda07504e"),
    ingredients: ["Pepperoni", "Mozzarella", "Tomato Sauce"],
    isAvailable: true,
    isApproved: true,
    approvalStatus: "approved",
    vendorId: "demo-vendor-001",
    vendorName: "Bonita Pizza",
    location: "Brooklyn, NY",
    createdAt: new Date(),
  },
  {
    name: "BBQ Chicken",
    description: "Smoky BBQ sauce with grilled chicken.",
    price: 750,
    category: "Specialty / Gourmet",
    image: IMG("photo-1565299624946-b28f40a0ae38"),
    ingredients: ["Chicken", "BBQ Sauce", "Onion", "Cheese"],
    isAvailable: true,
    isApproved: true,
    approvalStatus: "approved",
    vendorId: "demo-vendor-002",
    vendorName: "Little Oven Co.",
    location: "Manhattan, NY",
    createdAt: new Date(),
  },
  {
    name: "Veggie Supreme",
    description: "Fresh vegetables with delicious cheese.",
    price: 600,
    category: "Vegetarian Pizzas",
    image: IMG("photo-1571407970349-bc81e7e96d47"),
    ingredients: ["Bell Pepper", "Olives", "Onion", "Mushrooms"],
    isAvailable: true,
    isApproved: true,
    approvalStatus: "approved",
    vendorId: "demo-vendor-002",
    vendorName: "Little Oven Co.",
    location: "Manhattan, NY",
    createdAt: new Date(),
  },
  {
    name: "Four Cheese",
    description: "A rich combination of four different cheeses.",
    price: 800,
    category: "Specialty / Gourmet",
    image: IMG("photo-1518687739-ff8057e1b4b4"),
    ingredients: ["Mozzarella", "Cheddar", "Parmesan", "Gouda"],
    isAvailable: true,
    isApproved: true,
    approvalStatus: "approved",
    vendorId: "demo-vendor-001",
    vendorName: "Bonita Pizza",
    location: "Brooklyn, NY",
    createdAt: new Date(),
  },
  {
    name: "Spicy Chicken",
    description: "Spicy chicken with jalapeno and cheese.",
    price: 700,
    category: "Meat Lovers",
    image: IMG("photo-1595854341625-f33ee10dbf94"),
    ingredients: ["Chicken", "Jalapeno", "Chili", "Cheese"],
    isAvailable: true,
    isApproved: true,
    approvalStatus: "approved",
    vendorId: "demo-vendor-002",
    vendorName: "Little Oven Co.",
    location: "Manhattan, NY",
    createdAt: new Date(),
  },
  {
    name: "Truffle Shuffle",
    description: "A luxurious blend of truffle, mushroom and cheese.",
    price: 950,
    category: "Specialty / Gourmet",
    image: IMG("photo-1513104890138-7c749659a591"),
    ingredients: ["Truffle Oil", "Mushroom", "Mozzarella"],
    isAvailable: true,
    isApproved: true,
    approvalStatus: "approved",
    vendorId: "demo-vendor-003",
    vendorName: "North & Dough",
    location: "Queens, NY",
    createdAt: new Date(),
  },
  {
    name: "Sunday Sausage",
    description:
      "House-made Italian sausage, roasted peppers, mozzarella and a slow-cooked tomato sauce.",
    price: 850,
    category: "Meat Lovers",
    image: IMG("photo-1604382354936-07c5d9983bd3"),
    ingredients: ["Sausage", "Roasted Peppers", "Mozzarella"],
    isAvailable: true,
    isApproved: true,
    approvalStatus: "approved",
    vendorId: "demo-vendor-002",
    vendorName: "Little Oven Co.",
    location: "Manhattan, NY",
    createdAt: new Date(),
  },
  {
    name: "Garden Party",
    description: "Organic greens, fresh tomatoes and herbs.",
    price: 780,
    category: "Vegetarian Pizzas",
    image: IMG("photo-1571997478779-2adcbbe9ab2f"),
    ingredients: ["Organic Greens", "Tomato", "Basil"],
    isAvailable: true,
    isApproved: true,
    approvalStatus: "approved",
    vendorId: "demo-vendor-001",
    vendorName: "Bonita Pizza",
    location: "Brooklyn, NY",
    createdAt: new Date(),
  },
  {
    name: "Garlic Knots",
    description: "Warm garlic knots with marinara for dipping.",
    price: 350,
    category: "Sides & Appetizers",
    image: IMG("photo-1573140247632-f8fd74997d5c"),
    ingredients: ["Garlic", "Butter", "Parsley"],
    isAvailable: true,
    isApproved: true,
    approvalStatus: "approved",
    vendorId: "demo-vendor-003",
    vendorName: "North & Dough",
    location: "Queens, NY",
    createdAt: new Date(),
  },
  {
    name: "Tiramisu Cup",
    description: "Classic Italian dessert with coffee and mascarpone.",
    price: 400,
    category: "Beverages & Desserts",
    image: IMG("photo-1571877227200-a0d98ea607e9"),
    ingredients: ["Mascarpone", "Coffee", "Cocoa"],
    isAvailable: true,
    isApproved: true,
    approvalStatus: "approved",
    vendorId: "demo-vendor-003",
    vendorName: "North & Dough",
    location: "Queens, NY",
    createdAt: new Date(),
  },
];

async function seedMenu() {
  try {
    await client.connect();

    const db = client.db(process.env.DB_NAME || "pizzahub");
    const collection = db.collection("menuItems");

    const existingItems = await collection.countDocuments();

    if (existingItems > 0) {
      console.log("Menu collection already contains data.");
      console.log("Updating existing items with images...");

      for (const item of samplePizzas) {
        await collection.updateMany(
          { name: item.name },
          {
            $set: {
              image: item.image,
              images: [item.image],
              category: item.category,
              location: item.location,
              vendorName: item.vendorName,
              isApproved: true,
              approvalStatus: "approved",
              isAvailable: true,
            },
          }
        );
      }

      // Alias names used by the original seed data
      const aliases = [
        {
          name: "Four Cheese Pizza",
          image: IMG("photo-1518687739-ff8057e1b4b4"),
          category: "Specialty / Gourmet",
        },
        {
          name: "Spicy Chicken Pizza",
          image: IMG("photo-1595854341625-f33ee10dbf94"),
          category: "Meat Lovers",
        },
      ];

      for (const item of aliases) {
        await collection.updateMany(
          { name: item.name },
          {
            $set: {
              image: item.image,
              images: [item.image],
              category: item.category,
              isApproved: true,
              approvalStatus: "approved",
              isAvailable: true,
            },
          }
        );
      }

      console.log("Menu images updated.");
      return;
    }

    const result = await collection.insertMany(samplePizzas);

    console.log(
      `🍕 ${result.insertedCount} menu items inserted successfully!`
    );
  } catch (error) {
    console.error("Seed failed:", error.message);
  } finally {
    await client.close();
  }
}

seedMenu();