import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit es un CLI separado de Next, así que cargamos .env.local
// explícitamente (Next lo carga solo, pero drizzle-kit no).
dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Supabase gestiona los schemas auth.* y storage.*; nosotros solo public.
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
});
