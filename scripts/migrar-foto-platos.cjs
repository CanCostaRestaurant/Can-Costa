// Añade la columna foto_url a platos (foto del plato como data URL comprimida).
// Idempotente. Ejecutar: node scripts/migrar-foto-platos.cjs
require("dotenv").config({ path: ".env.local" });
const postgres = require("postgres");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL no configurada en .env.local");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

(async () => {
  try {
    await sql`ALTER TABLE platos ADD COLUMN IF NOT EXISTS foto_url text`;
    const [c] = await sql`
      select count(*)::int as total,
             count(foto_url)::int as con_foto
      from platos`;
    console.log("Columna foto_url lista →", c);
    await sql.end();
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
})();
