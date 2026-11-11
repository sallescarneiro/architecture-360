// T-213 — Treinamento dentro do A360: qual trilha cada perfil vê.
export const TRILHAS: Record<string, string> = { arquiteta: "Arquitetas", coordenacao: "Coordenação", gerencia: "Gerência" };
export function trilhaDoPerfil(perfil: string): string { return perfil === "arquiteta" ? "arquiteta" : perfil === "coordenacao" ? "coordenacao" : "gerencia"; }
export function podeVerTrilha(perfil: string, trilha: string): boolean { return perfil === "admin" || perfil === "gestao" || trilhaDoPerfil(perfil) === trilha; }
