---
name: Suppliers PO routing order
description: Why purchase-order routes must come before /:id in suppliers router
---
In Express, a parameterized route like `GET /:id` will greedily match any path segment including literal strings like `purchase-orders`. Always declare specific literal routes (`/purchase-orders`, `/purchase-orders/:id/status`, `/purchase-orders/:id/receive`) BEFORE the parameterized `/:id` route in the same router.

**Why:** Without this order, `GET /suppliers/purchase-orders` gets matched by `GET /suppliers/:id` with id="purchase-orders", causing wrong responses.

**How to apply:** Any time a router has both `/:id` and a literal sub-route at the same depth, put literals first.
