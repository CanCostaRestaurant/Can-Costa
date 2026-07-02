// Comprobación rápida de conexión a la BD (node scripts/ping-db.cjs).
require("dotenv").config({ path: ".env.local" });
const postgres = require("postgres");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL no configurada en .env.local");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

sql`select
      (select count(*)::int from proveedores) as proveedores,
      (select count(*)::int from productos)   as productos,
      (select count(*)::int from precios)     as precios`
  .then((r) => {
    console.log("Conexión OK →", r[0]);
    return sql.end();
  })
  .catch((e) => {
    console.error("ERROR de conexión:", e.message);
    process.exit(1);
  });
