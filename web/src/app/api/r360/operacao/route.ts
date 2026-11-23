import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { operacaoPara360 } from "@/lib/servicos/r360-operacao";

export const dynamic = "force-dynamic";

/**
 * Leitura da operação de arquitetura para o Rucelle 360° (área Arquitetura, Visão 360° e Diretor de IA).
 * T-281, pedido de Rodrigo em 23/11/2026. SOMENTE LEITURA, só agregados (nada por pessoa).
 * Mesma chave da Gestão diária: cabeçalho x-r360-key igual a R360_READ_KEY. Sem a variável, a rota fica desligada.
 */
const iguais = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export async function GET(req: Request) {
  const chave = process.env.R360_READ_KEY;
  if (!chave || chave.length < 16) return NextResponse.json({ erro: "leitura do 360° desligada" }, { status: 503 });
  if (!iguais(req.headers.get("x-r360-key") ?? "", chave)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  return NextResponse.json(await operacaoPara360(), { headers: { "cache-control": "no-store" } });
}
