---
name: Drizzle raw SQL result access
description: How to access rows from db.execute(sql`...`) in this codebase
---
`db.execute(sql\`...\`)` returns a result object where rows are under `.rows`. Cast to `any` to avoid TS errors: `(result as any).rows`.

**Why:** Drizzle's raw execute return type is not fully typed. Consistent pattern across the codebase.

**How to apply:** Always use `(await db.execute(sql\`...\`)).rows` or `(result as any).rows` when using raw SQL.
