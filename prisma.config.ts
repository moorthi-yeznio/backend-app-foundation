import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Schema engine (migrate, db push) uses `url` — must be direct/session-pooler connection (port 5432)
    // NOT the transaction pooler (port 6543) which doesn't support prepared statements
    url: process.env["DIRECT_URL"] as string,
  },
});
