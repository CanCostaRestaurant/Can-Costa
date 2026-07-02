// Cliente Drizzle conectado a la Postgres de Supabase (driver postgres-js).
// Session Pooler (5432), max:1, prepare:false. Singleton vía globalThis.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  pgClient: ReturnType<typeof postgres> | undefined;
};

function getClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL no configurada. Copia .env.local.example a .env.local.",
    );
  }
  if (!globalForDb.pgClient) {
    globalForDb.pgClient = postgres(process.env.DATABASE_URL, {
      max: 1,
      idle_timeout: 20,
      prepare: false,
    });
  }
  return globalForDb.pgClient;
}

export const db = drizzle(getClient(), { schema });
export { schema };
