/**
 * Linhas das tabelas de supabase/schema.sql.
 * Colunas jsonb usam os tipos dos contratos da IA.
 */
import type {
  AnaliseProva,
  Barema,
  CategoriaGrupo,
  CorrecaoAluno,
  CorrecaoQuestao,
  CriterioBarema,
  FeedbackAluno,
  ResultadoBarema,
} from "@/lib/ai/schemas";

export type StatusProva = "rascunho" | "analisada" | "barema_pronto" | "corrigindo" | "corrigida";
export type StatusSubmissao = "enviada" | "corrigindo" | "corrigida" | "erro";

export interface Turma {
  id: string;
  nome: string;
  created_at: string;
}

export interface Aluno {
  id: string;
  turma_id: string;
  nome: string;
  created_at: string;
}

export interface Prova {
  id: string;
  turma_id: string | null;
  titulo: string;
  arquivo_path: string | null;
  arquivo_nome: string | null;
  data_avaliacao: string | null;
  status: StatusProva;
  analise: AnaliseProva | null;
  barema: Barema | null;
  barema_origem: ResultadoBarema["origem"] | null;
  barema_problemas: ResultadoBarema["problemas"] | null;
  created_at: string;
}

export interface Submissao {
  id: string;
  prova_id: string;
  aluno_id: string | null;
  arquivo_paths: string[];
  status: StatusSubmissao;
  nome_lido: string | null;
  correcao: CorrecaoAluno | null;
  erro: string | null;
  created_at: string;
}

export interface Grupo {
  id: string;
  prova_id: string;
  numero: number;
  rotulo: string;
  categoria: CategoriaGrupo;
  descricao: string;
  nota_sugerida: number;
  comentario_sugerido: string;
  criterio_sugerido: CriterioBarema | null;
  aprovado: boolean;
  nota_final: number | null;
  comentario_final: string | null;
  created_at: string;
}

export interface Resposta {
  id: string;
  submissao_id: string;
  prova_id: string;
  numero: number;
  correcao: CorrecaoQuestao;
  grupo_id: string | null;
  nota_final: number | null;
  comentario_final: string | null;
}

export interface Feedback {
  id: string;
  submissao_id: string;
  token: string;
  conteudo: FeedbackAluno;
  publicado: boolean;
  created_at: string;
}
