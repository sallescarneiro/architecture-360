import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Health check do Railway: responde 200 só se o banco estiver acessível. Não expõe dados. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
export const dynamic = "force-dynamic";
