import { db, BUCKET_PROVAS } from '@/lib/db/server';
import { privateHeaders } from '@/lib/db/api';
import { createClient } from '@supabase/supabase-js';
export async function GET() {
  const configuracao = { banco: Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()), ia: Boolean(process.env.FEATHERLESS_API_KEY?.trim()) };
  let banco = false;
  let arquivos = false;
  const prazos = { campos: false, funcaoServidor: false, acessoAnonimoBloqueado: false };
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
      const fields = await client.from('provas').select('prazo_envio,excecoes_envio').limit(0);
      prazos.campos = !fields.error;
      // Identificadores sintéticos e remoção sem versão anterior: a chamada nunca
      // grava dados, mesmo se esses identificadores já existissem no banco.
      const id = '00000000-0000-4000-8000-000000000000';
      const args = { p_prova: id, p_aluno: id, p_envio: id, p_anteriores: null, p_paths: [], p_nomes: [], p_nome: '', p_remover: true };
      const probe = await client.rpc('confirmar_envio_aluno', args);
      prazos.funcaoServidor = probe.error?.code === 'P0001';
      const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
      if (publicKey) {
        const anonymous = createClient(process.env.SUPABASE_URL!.trim().replace(/\/rest\/v1\/?$/, ''), publicKey, { auth: { persistSession: false } });
        const denied = await anonymous.rpc('confirmar_envio_aluno', args);
        prazos.acessoAnonimoBloqueado = denied.error?.code === '42501';
      }
    } catch { /* Não retorna credenciais nem detalhes do provedor. */ }
  }
  const ok = banco && arquivos && configuracao.ia;
  return Response.json({ status: ok ? 'ok' : 'indisponivel', configuracao, banco, arquivos, prazos, observacao: 'A chave de IA só é validada por uma análise real.' }, { status: ok ? 200 : 503, headers: privateHeaders });
}
