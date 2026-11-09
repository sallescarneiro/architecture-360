import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";

/** Página inicial por perfil (T-199, D-D de 08/11/2026): arquiteta → Meu dia; coordenação, gestão e admin → Painel de Gestão. */
export default async function Inicio() {
  const u = await exigirUsuario();
  redirect(u.perfil === "arquiteta" ? "/meu-dia" : "/painel");
}
