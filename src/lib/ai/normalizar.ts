import type { AnaliseProva, Barema } from "./schemas";

/**
 * Provas com itens (1a, 1b) ou sem número claro fazem a IA repetir ou zerar
 * a numeração. Quando os números não são inteiros positivos e únicos,
 * renumera as questões na ordem em que aparecem (1, 2, 3…) e o barema pela
 * mesma posição. Se a numeração já é válida, devolve tudo como veio.
 */
export function normalizarNumeracao(analise: AnaliseProva, barema: Barema): { analise: AnaliseProva; barema: Barema; renumerada: boolean } {
  const numeros = analise.questoes.map(q => q.numero);
  const valida = numeros.every(n => Number.isInteger(n) && n > 0) && new Set(numeros).size === numeros.length;
  const baremaBate = barema.questoes.length === numeros.length && barema.questoes.every(b => numeros.includes(b.numero)) && new Set(barema.questoes.map(b => b.numero)).size === barema.questoes.length;
  if (valida && baremaBate) return { analise, barema, renumerada: false };
  if (barema.questoes.length !== analise.questoes.length) return { analise, barema, renumerada: false };

  return {
    analise: {
      ...analise,
      questoes: analise.questoes.map((q, i) => ({
        ...q,
        // Guarda a numeração original no enunciado quando ela muda, para o professor reconhecer o item.
        enunciado: q.numero === i + 1 ? q.enunciado : `(Item ${q.numero} na prova) ${q.enunciado}`,
        numero: i + 1,
      })),
    },
    barema: {
      questoes: barema.questoes.map((b, i) => ({
        ...b,
        numero: i + 1,
        criterios: b.criterios.map((c, j) => ({ ...c, id: c.id.trim() || `q${i + 1}-c${j + 1}` })),
      })),
    },
    renumerada: true,
  };
}
