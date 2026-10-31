import { db, BUCKET_PROVAS } from '@/lib/db/server';
import { privateHeaders } from '@/lib/db/api';
export async function GET() {
  const configuracao = { banco: Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()), ia: Boolean(process.env.FEATHERLESS_API_KEY?.trim()) };
  let banco = false;
  let arquivos = false;
  if (configuracao.banco) {
    try {
      const client = db();
      const results = await Promise.all([
        client.from('provas').select('id,arquivo_path,arquivo_nome,data_avaliacao,analise,barema,barema_origem,barema_problemas,status').limit(0),
        client.from('alunos').select('id,turma_id,nome,referencia_local').limit(0),
        client.from('submissoes').select('id,prova_id,aluno_id,arquivo_paths,arquivo_nomes,nome_lido,nome_leitura_erro,status').limit(0),
      ]);
      banco = results.every(r => !r.error);
      const { data, error } = await client.storage.getBucket(BUCKET_PROVAS);
      arquivos = !error && Boolean(data) && !data?.public;
    } catch { /* Não retorna credenciais nem detalhes do provedor. */ }
  }
  const ok = banco && arquivos && configuracao.ia;
  return Response.json({ status: ok ? 'ok' : 'indisponivel', configuracao, banco, arquivos, observacao: 'A chave de IA só é validada por uma análise real.' }, { status: ok ? 200 : 503, headers: privateHeaders });
}
