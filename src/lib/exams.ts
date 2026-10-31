import type { Prova } from './db/types';
import type { Exam, Question } from './data';
const difficulty: Record<string, Question['difficulty']> = { facil: 'Fácil', media: 'Média', dificil: 'Difícil' };
export function examFromProva(prova: Prova): Exam {
  return { id: prova.id, title: prova.titulo, date: prova.data_avaliacao || prova.created_at.slice(0,10), file: prova.arquivo_nome || 'Prova', persisted: true,
    revision: prova.revisao, analysis: prova.analise || undefined,
    status: prova.status === 'barema_pronto' ? 'Aguardando respostas' : prova.status === 'corrigida' ? 'Concluída' : prova.status === 'corrigindo' ? 'Em correção' : 'Rascunho',
    questions: (prova.analise?.questoes || []).map(q => ({ id: `q${q.numero}`, number: q.numero, topic: q.conteudo, text: q.enunciado, answer: q.resolucao.respostaFinal,
      difficulty: difficulty[q.dificuldadeEstimada], criteria: (prova.barema?.questoes.find(b => b.numero === q.numero)?.criterios || []).map(c => ({ id: c.id, text: c.descricao, points: c.pontos })) })),
    responses: {}, released: false };
}
