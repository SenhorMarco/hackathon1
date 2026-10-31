import 'server-only';
import { account } from '@/lib/auth/server';
import { db } from '@/lib/db/server';

export type Conta = NonNullable<Awaited<ReturnType<typeof account>>>;

/** Uma prova recebe envios depois que o professor confirma o barema e até liberar as notas. */
export const STATUS_RECEBE_ENVIO = ['barema_pronto', 'corrigindo'];

export type SituacaoProva = 'aguardando_envio' | 'enviada' | 'em_correcao' | 'devolutiva' | 'encerrada' | 'prazo_encerrado';

export interface ProvaDoAluno {
  id: string;
  titulo: string;
  data: string | null;
  prazo: string | null;
  situacao: SituacaoProva;
  podeEnviar: boolean;
  envio: { id: string; arquivos: string[]; enviadoEm: string } | null;
  devolutiva: string | null;
}

export interface TurmaDoAluno {
  id: string;
  nome: string;
  disciplina: string | null;
  turno: string | null;
  professor: string;
  provas: ProvaDoAluno[];
}

/** Prazo opcional (coluna provas.prazo_envio); sem prazo, a prova fica aberta enquanto recebe envios. */
function prazoAberto(prova: Record<string, unknown>) {
  const prazo = typeof prova.prazo_envio === 'string' ? Date.parse(prova.prazo_envio) : NaN;
  return Number.isNaN(prazo) || prazo > Date.now();
}

/** Registros de aluno ligados ao e-mail da conta (um por turma). */
export async function alunosDaConta(conta: Conta) {
  const { data, error } = await db().from('alunos').select('id, turma_id, nome').eq('email', conta.email.toLowerCase());
  if (error) throw error;
  return data || [];
}

/** Confere se o aluno logado pertence à turma da prova e se ela aceita envio agora. */
export async function provaDoAluno(conta: Conta, provaId: string) {
  const { data: prova, error } = await db().from('provas').select('*').eq('id', provaId).maybeSingle();
  if (error) throw error;
  if (!prova?.turma_id) return null;
  const aluno = (await alunosDaConta(conta)).find(a => a.turma_id === prova.turma_id);
  if (!aluno) return null;
  return { prova, aluno, aceitaEnvio: STATUS_RECEBE_ENVIO.includes(prova.status) && prazoAberto(prova) };
}

export async function carregarPortal(conta: Conta): Promise<TurmaDoAluno[]> {
  const alunos = await alunosDaConta(conta);
  if (!alunos.length) return [];
  const turmaIds = [...new Set(alunos.map(a => a.turma_id))];
  const alunoIds = alunos.map(a => a.id);

  const [turmas, provas, envios] = await Promise.all([
    db().from('turmas').select('*').in('id', turmaIds),
    db().from('provas').select('*').in('turma_id', turmaIds).order('created_at', { ascending: false }),
    db().from('submissoes').select('id, prova_id, aluno_id, status, arquivo_nomes, created_at').in('aluno_id', alunoIds).order('created_at', { ascending: false }),
  ]);
  for (const r of [turmas, provas, envios]) if (r.error) throw r.error;

  const professorIds = [...new Set((turmas.data || []).map(t => t.professor_id).filter(Boolean))];
  const envioIds = (envios.data || []).map(e => e.id);
  const [perfis, devolutivas] = await Promise.all([
    professorIds.length ? db().from('perfis').select('id, nome').in('id', professorIds) : Promise.resolve({ data: [], error: null }),
    envioIds.length ? db().from('feedbacks').select('submissao_id, token').in('submissao_id', envioIds).eq('publicado', true) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [perfis, devolutivas]) if (r.error) throw r.error;

  return (turmas.data || []).map(t => ({
    id: t.id,
    nome: t.nome,
    disciplina: t.disciplina ?? null,
    turno: t.turno ?? null,
    professor: perfis.data?.find(p => p.id === t.professor_id)?.nome || 'Professor da turma',
    provas: (provas.data || [])
      // Rascunhos e provas ainda em análise não aparecem para o aluno.
      .filter(p => p.turma_id === t.id && (STATUS_RECEBE_ENVIO.includes(p.status) || p.status === 'corrigida'))
      .map(p => {
        const envio = envios.data?.find(e => e.prova_id === p.id);
        const devolutiva = envio ? devolutivas.data?.find(d => d.submissao_id === envio.id)?.token ?? null : null;
        const aberta = STATUS_RECEBE_ENVIO.includes(p.status) && prazoAberto(p);
        const situacao: SituacaoProva = devolutiva ? 'devolutiva'
          : p.status === 'corrigida' ? 'encerrada'
          : envio && ['corrigindo', 'corrigida'].includes(envio.status) ? 'em_correcao'
          : envio ? 'enviada'
          : aberta ? 'aguardando_envio' : 'prazo_encerrado';
        return {
          id: p.id, titulo: p.titulo, data: p.data_avaliacao ?? null, prazo: typeof p.prazo_envio === 'string' ? p.prazo_envio : null,
          situacao, podeEnviar: aberta, devolutiva,
          envio: envio ? { id: envio.id, arquivos: envio.arquivo_nomes || [], enviadoEm: envio.created_at } : null,
        };
      }),
  }));
}
