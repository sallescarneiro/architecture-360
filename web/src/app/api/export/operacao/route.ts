import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { panoramaParaContrato } from "@/lib/servicos/operacao";

export const dynamic = "force-dynamic";

/**
 * Exportação para o Rucelle 360° — mesmo padrão da Central de Operações (/api/export/metrics):
 * cabeçalho `x-admin-key` comparado em tempo constante com EXPORT_TOKEN.
 * Enquanto EXPORT_TOKEN não estiver definido, o endpoint fica desligado (503) — preparação, não integração ativa.
 * Só devolve agregados da operação (contrato a360.operacao.v1); nunca dados por pessoa.
 */
export async function GET(req: Request) {
  const esperado = process.env.EXPORT_TOKEN;
  if (!esperado) return NextResponse.json({ erro: "exportação não habilitada" }, { status: 503 });
  const recebido = req.headers.get("x-admin-key") ?? "";
  const a = Buffer.from(recebido), b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  return NextResponse.json(await panoramaParaContrato(), { headers: { "cache-control": "no-store" } });
}
