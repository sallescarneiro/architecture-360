// Aplica as migrações de ./drizzle usando só dependências de runtime (sem drizzle-kit).
// Usado no start do Railway: `node scripts/migrate.mjs && next start`.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definida");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const db = drizzle(pool);
try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("migrações aplicadas");
} finally {
  await pool.end();
}
