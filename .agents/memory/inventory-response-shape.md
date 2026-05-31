---
name: Inventory API response shape
description: GET /api/inventory returns an object, not a flat array
---
`GET /api/inventory` returns `{ items: InventoryItem[], totalValue: number, lowStockCount: number, outOfStockCount: number }`.

**Why:** Stats are computed server-side alongside the list query for efficiency. Consumers must destructure `{ items }` before mapping/filtering.

**How to apply:** Any component or API consumer fetching /inventory must expect an object and not use the result directly as an array.
