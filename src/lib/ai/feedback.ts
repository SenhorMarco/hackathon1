import type OpenAI from "openai";
import { gerarJson } from "./json";
import { FeedbackAluno, type AnaliseProva, type Barema, type CorrecaoQuestao } from "./schemas";

/** O schema é acrescentado automaticamente por gerarJson. */
export const PROMPT_FEEDBACK = `Você escreve a devolutiva de uma prova para um aluno do ensino médio, a partir da correção já revisada pelo professor.

A nota e o comentário do professor são a decisão final: não os contradiga, não mude notas e não critique a correção. Use somente os dados fornecidos. Não invente erros ou acertos que não estejam na correção.

Fale diretamente com o aluno, em português claro e encorajador, sem exagero. Para cada questão:
- acertos: o que ele fez bem, com base nos passos corretos.
- erro: onde errou; vazio se acertou tudo.
- porque: por que aquilo é um erro, explicando a ideia, sem entregar a resposta final da questão.
- dica: uma orientação prática para a próxima vez.
- exercicios: um ou dois exercícios curtos e novos sobre o ponto exato do erro, com a resposta. Se a questão estiver toda certa, um exercício um pouco mais desafiador do mesmo conteúdo.

No resumo, duas ou três frases sobre o desempenho geral. Em proximosPassos, de duas a quatro ações concretas de estudo, em ordem de prioridade, ligadas aos erros encontrados.`;

export interface QuestaoCorrigida {
  numero: number;
  correcao: CorrecaoQuestao;
  notaFinal: number;
  comentarioProfessor: string | null;
}

export interface PedidoFeedback {
  cliente: OpenAI;
  modelo: string;
  analise: AnaliseProva;
  barema: Barema;
  questoes: QuestaoCorrigida[];
  maxTokens?: number;
}

export function gerarFeedback({ cliente, modelo, analise, barema, questoes, maxTokens }: PedidoFeedback): Promise<FeedbackAluno> {
  const dados = questoes.map(q => {
    const enunciado = analise.questoes.find(a => a.numero === q.numero);
    const valor = barema.questoes.find(b => b.numero === q.numero)?.valorTotal ?? null;
    return {
      numero: q.numero,
      conteudo: enunciado?.conteudo,
      enunciado: enunciado?.enunciado,
      nota: q.notaFinal,
      valorQuestao: valor,
      comentarioProfessor: q.comentarioProfessor,
      transcricao: q.correcao.transcricao,
      passos: q.correcao.passos,
      tipoErro: q.correcao.tipoErro,
      metodo: q.correcao.descricaoMetodo,
    };
  });
  return gerarJson({
    cliente,
    modelo,
    schema: FeedbackAluno,
    sistema: PROMPT_FEEDBACK,
    texto: `Escreva a devolutiva do aluno com base nesta correção:\n${JSON.stringify(dados)}`,
    maxTokens: maxTokens ?? 6000,
    semRaciocinio: true,
  });
}
