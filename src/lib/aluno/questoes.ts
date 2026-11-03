/**
 * Envio por questão: as fotos de cada questão ficam em `.../submissoes/<id>/q<numero>/...`.
 * O número sai do próprio caminho, então a tabela submissoes não precisa de coluna nova.
 */
export function questaoDoCaminho(path: string): number | null {
  const m = path.match(/\/q(\d+)\//);
  return m ? Number(m[1]) : null;
}

/** Junta as fotos novas de uma questão às já enviadas, substituindo as dessa questão e mantendo a ordem das questões. */
export function juntarFotos(
  antigos: { path: string; nome: string }[],
  novos: { path: string; nome: string }[],
  numero: number,
) {
  const mantidos = antigos.filter(a => questaoDoCaminho(a.path) !== numero && questaoDoCaminho(a.path) !== null);
  return [...mantidos, ...novos].sort((a, b) => (questaoDoCaminho(a.path) ?? 0) - (questaoDoCaminho(b.path) ?? 0));
}
