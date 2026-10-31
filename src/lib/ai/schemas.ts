/**
 * Contratos (formato JSON) de cada etapa da IA.
 *
 * Cada schema é passado ao Claude via structured outputs (`zodOutputFormat`),
 * então a resposta sempre chega validada neste formato. O front e o banco
 * usam os tipos inferidos daqui — mudou um campo, muda só neste arquivo.
 *
 * Fluxo: análise prévia → barema → correção por aluno → agrupamento → feedback.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Enums compartilhados                                                */
/* ------------------------------------------------------------------ */

export const Dificuldade = z.enum(["facil", "media", "dificil"]);

/** Se a questão tem resposta e se ela é bem definida. */
export const StatusResposta = z.enum([
  "unica", // uma resposta, bem definida
  "multiplas", // mais de uma resposta válida
  "sem_solucao", // não tem solução como está escrita
  "ambigua", // o enunciado permite leituras diferentes
]);

export const TipoErro = z.enum([
  "nenhum",
  "calculo", // conta errada
  "sinal", // erro de sinal
  "conceito", // usou a ideia errada
  "incompleto", // parou no meio
  "em_branco",
  "outro",
]);

export const CategoriaGrupo = z.enum([
  "correto",
  "alternativo_valido", // caminho diferente do gabarito, mas correto
  "parcial",
  "erro",
  "em_branco",
]);

/* ------------------------------------------------------------------ */
/* 1. Análise prévia da prova                                          */
/* ------------------------------------------------------------------ */

export const QuestaoAnalisada = z.object({
  numero: z.number().describe("Número da questão na prova, começando em 1"),
  enunciado: z.string().describe("Transcrição fiel do enunciado"),
  conteudo: z
    .string()
    .describe("Tema de matemática cobrado, ex.: 'função quadrática'"),
  resolucao: z.object({
    passos: z.array(z.string()).describe("Resolução de referência, passo a passo"),
    respostaFinal: z.string(),
  }),
  existenciaResposta: z.object({
    status: StatusResposta,
    observacao: z
      .string()
      .describe("Por que a resposta é única, múltipla, inexistente ou ambígua"),
  }),
  problemasEnunciado: z
    .array(z.string())
    .describe("Problemas no enunciado: dado faltando, ambiguidade, erro. Vazio se não houver"),
  dificuldadeEstimada: Dificuldade,
  justificativaDificuldade: z.string(),
});

export const AnaliseProva = z.object({
  questoes: z.array(QuestaoAnalisada),
  observacoesGerais: z.string().describe("Comentário geral sobre a prova para o professor"),
});

/* ------------------------------------------------------------------ */
/* 2. Barema (sugerido ou analisado)                                   */
/* ------------------------------------------------------------------ */

export const CriterioBarema = z.object({
  id: z.string().describe("Identificador curto e estável, ex.: 'q1-c2'"),
  descricao: z.string().describe("O que o aluno precisa mostrar para ganhar os pontos"),
  pontos: z.number(),
});

export const BaremaQuestao = z.object({
  numero: z.number(),
  valorTotal: z.number().describe("Soma dos pontos dos critérios desta questão"),
  criterios: z.array(CriterioBarema),
});

export const Barema = z.object({
  questoes: z.array(BaremaQuestao),
});

/** Resposta da IA na etapa de barema: sugere um novo ou revisa o do professor. */
export const ResultadoBarema = z.object({
  origem: z.enum(["sugerido", "analisado"]),
  barema: Barema.describe(
    "Barema pronto para uso. Se o professor enviou um, é a versão revisada dele",
  ),
  problemas: z
    .array(
      z.object({
        numero: z.number(),
        descricao: z.string().describe("Problema encontrado no barema do professor"),
        sugestao: z.string(),
      }),
    )
    .describe("Vazio quando o barema foi sugerido do zero ou não tem problemas"),
});

/* ------------------------------------------------------------------ */
/* 3. Correção da prova de um aluno                                    */
/* ------------------------------------------------------------------ */

export const PassoAvaliado = z.object({
  descricao: z.string().describe("O que o aluno fez neste passo"),
  correto: z.boolean(),
  comentario: z.string().describe("Por que está certo ou errado. Curto"),
});

export const CorrecaoQuestao = z.object({
  numero: z.number(),
  transcricao: z.string().describe("Transcrição do que o aluno escreveu"),
  legivel: z.boolean().describe("Falso se a letra impediu uma leitura confiável"),
  passos: z.array(PassoAvaliado),
  metodo: z.enum(["padrao", "alternativo"]),
  descricaoMetodo: z
    .string()
    .describe("Resumo do caminho usado, ex.: 'Bhaskara em vez de soma e produto'"),
  tipoErro: TipoErro,
  primeiroPassoErrado: z
    .number()
    .nullable()
    .describe("Índice (base 1) do primeiro passo errado, ou null se não houver"),
  criteriosAtendidos: z.array(z.string()).describe("ids dos critérios do barema atendidos"),
  notaSugerida: z.number(),
  justificativa: z.string().describe("Justificativa da nota, para o professor"),
});

export const CorrecaoAluno = z.object({
  nomeLido: z
    .string()
    .nullable()
    .describe("Nome escrito no cabeçalho, ou null se não houver ou estiver ilegível"),
  questoes: z.array(CorrecaoQuestao),
});

/* ------------------------------------------------------------------ */
/* 4. Agrupamento das respostas de uma questão                         */
/* ------------------------------------------------------------------ */

export const GrupoRespostas = z.object({
  rotulo: z.string().describe("Nome curto do grupo, ex.: 'Erro de sinal no Δ'"),
  categoria: CategoriaGrupo,
  descricao: z.string().describe("O que as respostas deste grupo têm em comum"),
  respostaIds: z.array(z.string()).describe("ids das respostas que pertencem ao grupo"),
  notaSugerida: z.number(),
  comentarioSugerido: z.string().describe("Comentário que o aluno vai ler"),
  criterioSugerido: CriterioBarema.nullable().describe(
    "Novo critério de barema para solução alternativa válida; null nos outros casos",
  ),
});

export const AgrupamentoQuestao = z.object({
  numero: z.number(),
  grupos: z.array(GrupoRespostas),
});

/* ------------------------------------------------------------------ */
/* 5. Feedback individual do aluno                                     */
/* ------------------------------------------------------------------ */

export const ExercicioReforco = z.object({
  enunciado: z.string(),
  resposta: z.string(),
});

export const FeedbackQuestao = z.object({
  numero: z.number(),
  acertos: z.string().describe("O que o aluno fez bem nesta questão"),
  erro: z.string().describe("Onde errou. Vazio se acertou tudo"),
  porque: z.string().describe("Por que é um erro, sem entregar a resposta pronta"),
  dica: z.string(),
  exercicios: z.array(ExercicioReforco).describe("1 ou 2 exercícios sobre o ponto do erro"),
});

export const FeedbackAluno = z.object({
  resumo: z.string().describe("Duas ou três frases, falando direto com o aluno"),
  questoes: z.array(FeedbackQuestao),
  proximosPassos: z.array(z.string()),
});

/* ------------------------------------------------------------------ */
/* Tipos inferidos                                                     */
/* ------------------------------------------------------------------ */

export type Dificuldade = z.infer<typeof Dificuldade>;
export type StatusResposta = z.infer<typeof StatusResposta>;
export type TipoErro = z.infer<typeof TipoErro>;
export type CategoriaGrupo = z.infer<typeof CategoriaGrupo>;
export type QuestaoAnalisada = z.infer<typeof QuestaoAnalisada>;
export type AnaliseProva = z.infer<typeof AnaliseProva>;
export type CriterioBarema = z.infer<typeof CriterioBarema>;
export type BaremaQuestao = z.infer<typeof BaremaQuestao>;
export type Barema = z.infer<typeof Barema>;
export type ResultadoBarema = z.infer<typeof ResultadoBarema>;
export type PassoAvaliado = z.infer<typeof PassoAvaliado>;
export type CorrecaoQuestao = z.infer<typeof CorrecaoQuestao>;
export type CorrecaoAluno = z.infer<typeof CorrecaoAluno>;
export type GrupoRespostas = z.infer<typeof GrupoRespostas>;
export type AgrupamentoQuestao = z.infer<typeof AgrupamentoQuestao>;
export type ExercicioReforco = z.infer<typeof ExercicioReforco>;
export type FeedbackQuestao = z.infer<typeof FeedbackQuestao>;
export type FeedbackAluno = z.infer<typeof FeedbackAluno>;
