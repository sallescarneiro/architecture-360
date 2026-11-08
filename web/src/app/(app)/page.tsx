import { redirect } from "next/navigation";

/** A página inicial é a Central de Trabalho (Fase 2); o panorama da operação continua em /panorama. */
export default function Inicio() {
  redirect("/meu-dia");
}
