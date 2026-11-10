import type { Prova, Resposta, Submissao } from './db/types';

type Submission = Pick<Submissao, 'id' | 'aluno_id' | 'status' | 'arquivo_paths'>;
type Answer = Pick<Resposta, 'id' | 'prova_id' | 'submissao_id' | 'numero' | 'correcao' | 'nota_final' | 'comentario_final'>;
type Feedback = { id: string; submissao_id: string; conteudo: unknown };

/** Protocolo comparado como jsonb pelo banco, sem depender de serialização de hashes. */
export function releaseSnapshot(prova: Pick<Prova, 'turma_id' | 'barema' | 'analise'>, submissions: Submission[], answers: Answer[], feedbacks: Feedback[]) {
  const ordered = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  return {
    prova: { turma_id: prova.turma_id, barema: prova.barema, analise: prova.analise },
    submissoes: ordered(submissions).map(s => ({ id: s.id, aluno_id: s.aluno_id, status: s.status, arquivo_paths: s.arquivo_paths ?? [] })),
    respostas: ordered(answers).map(r => ({ id: r.id, prova_id: r.prova_id, submissao_id: r.submissao_id, numero: r.numero,
      correcao: r.correcao, nota_final: r.nota_final, comentario_final: r.comentario_final })),
    feedbacks: ordered(feedbacks).map(f => ({ id: f.id, submissao_id: f.submissao_id, conteudo: f.conteudo })),
  };
}
