# PizzaHub — Pizza Ordering & Delivery Platform (Server)

Express.js + MongoDB backend for PizzaHub. Handles authentication verification (Better Auth JWT), role-based authorization, menu items, orders, vendor subscriptions (Stripe) and admin operations.

## Important Features
- JWT verification middleware using `jose` (JWKS, issuer, audience)
- Role-based middleware for admin, vendor, customer
- Vendor applications and approval flow
- Menu item CRUD with admin approval workflow
- Order management with ownership checks
- Stripe Checkout + webhook-verified premium activation
- ImgBB image upload endpoint
- Admin user management (block/unblock, role changes)
- Transactions ledger for subscriptions

## Tech Stack
- Node.js, Express 5, MongoDB driver
- jose, dotenv, cors

## Installation
```bash
npm install
cp .env.example .env
# fill in the values
```

## Run Locally
```bash
npm run dev
```
Server runs on http://localhost:5000

## Environment Variables
See `.env.example`: `PORT`, `CLIENT_URL`, `MONGODB_URI`, `DB_NAME`, `AUTH_JWKS_URL`, `AUTH_ISSUER`, `AUTH_AUDIENCE`, `IMGBB_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `STRIPE_PREMIUM_AMOUNT`.

## Repository Links
- Client: https://github.com/rafiul-islam-dev/pizzahub-client
- Server: https://github.com/rafiul-islam-dev/pizzahub-server

## Live API
https://pizzahub-server-rouge.vercel.app/api

## Advanced Search / Sorting (Challenge)
`GET /api/menu` accepts `search`, `category`, `location` and `sort` (`price-low`, `price-high`, `name`) query parameters and returns enriched items (vendor name, premium flag) with premium vendors first.

## JWT / Token Verification (Challenge)
`authenticate` reads the Bearer token, verifies it against the Better Auth JWKS endpoint with issuer/audience checks, loads the user from MongoDB and attaches `req.user`. `authorizeRoles` enforces role access and suspension checks. All protected routes use both. Resource ownership is verified before any update/delete.