import { redirect } from "next/navigation";

/** /panorama foi absorvido pelo Painel de Gestão (T-199, decisão D-B de 08/11/2026). Redireciona para preservar links antigos. */
export default function PanoramaRedirect() {
  redirect("/painel");
}
