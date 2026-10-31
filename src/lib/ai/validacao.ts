import type { AnaliseProva, Barema, CorrecaoAluno, ResultadoBarema } from "./schemas";

/** Resultado estruturalmente válido, mas que exige revisão antes de seguir o fluxo. */
export class ErroRevisaoIA extends Error {
  constructor(readonly motivos: string[], readonly resultado?: unknown) {
    super(`Resultado da IA exige revisão: ${motivos.join("; ")}`);
    this.name = "ErroRevisaoIA";
  }
}

const perto = (a: number, b: number) => Math.abs(a - b) <= 0.000001;

export function validarBarema(barema: Barema): string[] {
  const erros: string[] = [];
  const numeros = new Set<number>();
  const ids = new Set<string>();
  for (const q of barema.questoes) {
    if (!Number.isInteger(q.numero) || q.numero < 1 || numeros.has(q.numero)) erros.push(`Questão ${q.numero}: número inválido ou repetido`);
    numeros.add(q.numero);
    if (!Number.isFinite(q.valorTotal) || q.valorTotal < 0) erros.push(`Questão ${q.numero}: total inválido`);
    for (const c of q.criterios) {
      if (!c.id.trim() || ids.has(c.id)) erros.push(`Critério ${c.id}: ID vazio ou repetido`);
      ids.add(c.id);
      if (!Number.isFinite(c.pontos) || c.pontos < 0) erros.push(`Critério ${c.id}: pontos inválidos`);
    }
    if (!perto(q.valorTotal, q.criterios.reduce((s, c) => s + c.pontos, 0))) erros.push(`Questão ${q.numero}: total diferente da soma dos critérios`);
  }
  return erros;
}

export function validarResultadoBarema(resultado: ResultadoBarema, analise: AnaliseProva, valores: Record<number, number>, origem: ResultadoBarema["origem"]): string[] {
  const erros = validarBarema(resultado.barema);
  if (resultado.origem !== origem) erros.push("Origem incompatível com o barema fornecido");
  const esperados = new Set(analise.questoes.map(q => q.numero));
  for (const q of resultado.barema.questoes) {
    if (!esperados.delete(q.numero)) erros.push(`Questão ${q.numero}: não solicitada ou repetida`);
    if (!perto(q.valorTotal, valores[q.numero])) erros.push(`Questão ${q.numero}: pontuação diferente da informada`);
  }
  if (esperados.size) erros.push("Há questões da análise sem barema");
  if (resultado.problemas.some(p => !analise.questoes.some(q => q.numero === p.numero))) erros.push("Problema vinculado a questão inexistente");
  return erros;
}

export interface RespostaTexto { numero: number; texto: string }

export function validarCorrecao(resultado: CorrecaoAluno, barema: Barema, respostasTexto?: RespostaTexto[]): string[] {
  const erros = validarBarema(barema);
  const numeros = new Set<number>();
  const originais = respostasTexto ? new Map(respostasTexto.map(r => [r.numero, r.texto])) : undefined;
  if (originais && originais.size !== respostasTexto!.length) erros.push("Texto de entrada com questão repetida");
  for (const q of resultado.questoes) {
    const b = barema.questoes.find(b => b.numero === q.numero);
    if (numeros.has(q.numero)) erros.push(`Questão ${q.numero}: correção repetida`);
    numeros.add(q.numero);
    if (!b) { erros.push(`Questão ${q.numero}: sem barema`); continue; }
    if (!q.legivel) erros.push(`Questão ${q.numero}: leitura insuficiente; revisão humana necessária`);
    if (originais && (!originais.has(q.numero) || q.transcricao !== originais.get(q.numero))) erros.push(`Questão ${q.numero}: transcrição diferente do texto original`);
    const ids = new Set(q.criteriosAtendidos);
    if (ids.size !== q.criteriosAtendidos.length || [...ids].some(id => !b.criterios.some(c => c.id === id))) erros.push(`Questão ${q.numero}: critérios repetidos ou inexistentes`);
    const soma = b.criterios.filter(c => ids.has(c.id)).reduce((s, c) => s + c.pontos, 0);
    if (!Number.isFinite(q.notaSugerida) || q.notaSugerida < 0 || q.notaSugerida > b.valorTotal || !perto(q.notaSugerida, soma)) erros.push(`Questão ${q.numero}: nota incompatível com os critérios`);
    const primeiro = q.passos.findIndex(p => !p.correto);
    if (q.primeiroPassoErrado !== (primeiro < 0 ? null : primeiro + 1)) erros.push(`Questão ${q.numero}: primeiro passo errado contradiz a avaliação dos passos`);
    if (primeiro >= 0 && q.tipoErro === "nenhum") erros.push(`Questão ${q.numero}: passos incorretos com tipoErro nenhum`);
  }
  if (originais && [...originais.keys()].some(n => !numeros.has(n))) erros.push("Há respostas fornecidas sem correção");
  return erros;
}
