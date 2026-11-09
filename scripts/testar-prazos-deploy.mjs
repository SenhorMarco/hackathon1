// Testes reais, sem navegador e sem IA. Mantém somente fixtures desta execução.
// node scripts/testar-prazos-deploy.mjs https://seu-deploy --criar-dados-sinteticos
// Configure as quatro variáveis do Supabase em .env.local; nunca as passe na CLI.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const target = process.argv[2];
if (!target || !process.argv.includes('--criar-dados-sinteticos')) {
  throw Error('Informe o deploy e --criar-dados-sinteticos. As fixtures serão mantidas para auditoria.');
}
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const base = new URL(target).origin;
const expectedOrigin = process.env.PRAZOS_DEPLOY_ORIGIN || 'https://hackathon1-blond.vercel.app';
assert.equal(base, new URL(expectedOrigin).origin, 'Destino diferente do deploy confiável; configure PRAZOS_DEPLOY_ORIGIN explicitamente para outro ambiente.');
const provider = process.env.SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, '');
const publicProvider = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
if (!provider || !publicProvider || !serviceKey || !publicKey) {
  throw Error('Faltam as quatro variáveis Supabase em .env.local. Não compartilhe chaves no chat.');
}
assert.equal(new URL(provider).origin, new URL(publicProvider).origin, 'As URLs devem apontar ao mesmo projeto.');
const admin = createClient(provider, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const label = `TESTE_PRAZOS_FINAL_${Date.now()}`;
const folder = `tmp/${label}`;
await mkdir(folder, { recursive: true });
const report = { label, base, startedAt: new Date().toISOString(), status: 'em andamento', checks: [], users: [], exams: [], files: [], aiCalls: 0 };
const save = () => writeFile(`${folder}/resultado.json`, JSON.stringify(report, null, 2));
const ok = async (name, details = {}) => {
  report.checks.push({ name, ...details }); await save(); console.log(`OK: ${name}`);
};
const checked = (result, operation) => {
  if (result.error) {
    const code = /^[a-z0-9_-]+$/i.test(result.error.code || '') ? result.error.code : 'falha';
    const error = Error(`${operation}: ${code}`);
    error.name = 'TestOperationError';
    throw error;
  }
  return result.data;
};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8mQAAAAASUVORK5CYII=', 'base64');
async function user(role, suffix) {
  const email = `qa-prazos-${randomUUID()}@example.com`;
  const password = `${randomUUID()}!aA9`;
  const data = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { nome: `${label} ${suffix}`, papel: role } }), 'Criar conta sintética');
  report.users.push({ id: data.user.id, role, suffix }); await save();
  const jar = new Map();
  const auth = createServerClient(publicProvider, publicKey, { auth: { autoRefreshToken: false },
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: values => values.forEach(v => jar.set(v.name, v.value)) } });
  checked(await auth.auth.signInWithPassword({ email, password }), 'Entrar na conta sintética');
  return { id: data.user.id, email, auth, cookie: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
}
async function request(actor, path, method = 'GET', body) {
  const response = await fetch(base + path, { method, redirect: 'manual',
    headers: { cookie: actor.cookie(), origin: base, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}
const endpoint = id => `/api/aluno/provas/${id}/envio`;
const configPath = id => `/api/exams/${id}/deadlines`;
async function exam(suffix, room) {
  const id = randomUUID();
  checked(await admin.from('provas').insert({ id, turma_id: room, titulo: `${label} ${suffix}`, status: 'rascunho' }), 'Criar prova sintética');
  report.exams.push(id); await save(); return id;
}
async function config(teacher, id, prazo, excecoes = {}) {
  const current = await request(teacher, configPath(id));
  assert.equal(current.status, 200, 'Professor deve acessar a fixture no deploy configurado.');
  const saved = await request(teacher, configPath(id), 'PUT', { prazo, excecoes, revisao: current.data.revisao });
  assert.equal(saved.status, 200, 'Configurar prazo da fixture'); return saved.data;
}
async function prepare(actor, id, name) {
  const result = await request(actor, endpoint(id), 'PUT', { files: [{ name, type: 'image/png', size: png.length }] });
  assert.equal(result.status, 200, 'Preparar upload ainda autorizado');
  const uploaded = await fetch(result.data.uploads[0].url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png,
    signal: AbortSignal.timeout(45000) });
  assert.ok(uploaded.ok, 'Arquivo deve chegar ao Storage antes de confirmar.');
  const ownTicket = JSON.parse(Buffer.from(result.data.ticket.split('.')[0], 'base64url'));
  report.files.push(...ownTicket.files.map(f => f.path)); await save();
  return result.data.ticket;
}
const confirm = (actor, id, ticket) => request(actor, endpoint(id), 'POST', { ticket });
const submissions = async id => checked(await admin.from('submissoes').select('*').eq('prova_id', id), 'Consultar somente submissões sintéticas');

await save();
try {
  const teacher = await user('professor', 'PROFESSOR');
  const a = await user('aluno', 'ALUNO A');
  const b = await user('aluno', 'ALUNO B');
  const room = randomUUID(); report.room = room; await save();
  checked(await admin.from('turmas').insert({ id: room, nome: label, professor_id: teacher.id }), 'Criar turma sintética');
  const aId = randomUUID(), bId = randomUUID();
  checked(await admin.from('alunos').insert([
    { id: aId, turma_id: room, nome: `${label} A`, email: a.email },
    { id: bId, turma_id: room, nome: `${label} B`, email: b.email },
  ]), 'Vincular duas contas à mesma turma');

  const boundary = await exam('ENCERRAMENTO', room);
  await config(teacher, boundary, null);
  assert.equal((await confirm(a, boundary, await prepare(a, boundary, 'original.png'))).status, 201);
  const original = (await submissions(boundary))[0];
  // As correções sintéticas servem para provar que uma recusa não as invalida.
  checked(await admin.from('provas').update({ barema: { questoes: [{ numero: 1, valorTotal: 2,
    criterios: [{ id: 'q1', descricao: 'Critério sintético', pontos: 2 }] }] } }).eq('id', boundary), 'Preparar barema sintético');
  const correction = { numero: 1, legivel: true, transcricao: 'Resposta sintética', descricaoMetodo: 'Sem IA',
    passos: [], primeiroErro: null, criteriosAtendidos: ['q1'], notaSugerida: 1, justificativa: 'Fixture manual de prazo' };
  checked(await admin.from('respostas').insert({ submissao_id: original.id, prova_id: boundary, numero: 1,
    correcao: correction, nota_final: 1, comentario_final: 'Correção sintética preservada' }), 'Preparar correção sintética');
  checked(await admin.from('feedbacks').insert({ submissao_id: original.id, conteudo: {}, publicado: false }), 'Preparar feedback sintético');
  const deadline = Date.now() + 30000;
  await config(teacher, boundary, new Date(deadline).toISOString());
  const crossing = await prepare(a, boundary, 'cruzou-prazo.png');
  assert.ok(Date.now() < deadline, 'Upload deve estar no Storage antes do encerramento.');
  console.log('Upload preparado e armazenado; aguardando o encerramento por até 30 segundos.');
  await delay(Math.max(0, deadline - Date.now()) + 1500);
  const expired = await confirm(a, boundary, crossing);
  assert.equal(expired.status, 409, 'Ticket válido não estende o prazo.');
  assert.match(expired.data.error, /não está recebendo envios/);
  const preserved = (await submissions(boundary))[0];
  assert.deepEqual(preserved.arquivo_paths, original.arquivo_paths);
  for (const table of ['respostas', 'feedbacks']) {
    const rows = checked(await admin.from(table).select('id').eq('submissao_id', original.id), 'Conferir correção preservada');
    assert.equal(rows.length, 1);
  }
  await ok('Upload autorizado antes do prazo e confirmado depois: HTTP 409, arquivo/correção/feedback preservados');

  const isolation = await exam('ISOLAMENTO', room);
  await config(teacher, isolation, new Date(Date.now() - 60000).toISOString(), { [aId]: new Date(Date.now() + 300000).toISOString() });
  const onlyA = await prepare(a, isolation, 'somente-a.png');
  const deniedB = await request(b, endpoint(isolation), 'PUT', { files: [{ name: 'b.png', type: 'image/png', size: png.length }] });
  assert.equal(deniedB.status, 409);
  assert.equal((await confirm(b, isolation, onlyA)).status, 409);
  assert.equal((await confirm(a, isolation, onlyA)).status, 201);
  assert.deepEqual((await submissions(isolation)).map(s => s.aluno_id), [aId]);
  // Agora B tem acesso à prova, mas não pode reutilizar o ticket de A.
  await config(teacher, isolation, null);
  const identityTicket = await prepare(a, isolation, 'identidade-a.png');
  const wrongIdentity = await confirm(b, isolation, identityTicket);
  assert.equal(wrongIdentity.status, 400); assert.match(wrongIdentity.data.error, /outra conta/);
  await ok('Duas contas na mesma turma: exceção só autoriza A; B não reutiliza o ticket de A');

  const concurrent = await exam('CONCORRENCIA', room);
  await config(teacher, concurrent, null);
  const [first, second] = await Promise.all([prepare(a, concurrent, 'primeiro-a.png'), prepare(a, concurrent, 'primeiro-b.png')]);
  const firstResults = await Promise.all([confirm(a, concurrent, first), confirm(a, concurrent, second)]);
  assert.deepEqual(firstResults.map(r => r.status).sort(), [201, 409]);
  let rows = await submissions(concurrent); assert.equal(rows.length, 1);
  await ok('Dois primeiros envios HTTP concorrentes: um 201, outro 409, uma única submissão');

  // A versão anterior idêntica torna a corrida de substituição determinística.
  // São chamadas separadas à RPC real, com os mesmos dados que o handler usa.
  const [replaceA, replaceB] = await Promise.all([prepare(a, concurrent, 'troca-a.png'), prepare(a, concurrent, 'troca-b.png')]);
  const tickets = [replaceA, replaceB].map(t => JSON.parse(Buffer.from(t.split('.')[0], 'base64url')));
  const before = rows[0];
  const rpcPayload = t => ({ p_prova: concurrent, p_aluno: aId, p_envio: before.id, p_anteriores: before.arquivo_paths,
    p_paths: t.files.map(f => f.path), p_nomes: t.files.map(f => f.name), p_nome: `${label} A`, p_remover: false });
  const races = await Promise.all(tickets.map(t => admin.rpc('confirmar_envio_aluno', rpcPayload(t))));
  assert.equal(races.filter(r => !r.error).length, 1);
  assert.equal(races.filter(r => r.error?.code === 'P0001').length, 1);
  const winner = races.findIndex(r => !r.error);
  rows = await submissions(concurrent); assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].arquivo_paths, tickets[winner].files.map(f => f.path));
  await ok('Substituições RPC concorrentes com a mesma versão anterior: uma aceita e outra rejeitada, sem sobrescrita');

  const state = await request(teacher, configPath(concurrent)); assert.equal(state.status, 200);
  const changes = await Promise.all([60000, 120000].map(ms => request(teacher, configPath(concurrent), 'PUT', {
    prazo: new Date(Date.now() + ms).toISOString(), excecoes: {}, revisao: state.data.revisao,
  })));
  assert.deepEqual(changes.map(r => r.status).sort(), [200, 409]);
  await ok('Duas edições concorrentes de prazo: revisão desatualizada recebe 409');
  const forbidden = await a.auth.rpc('confirmar_envio_aluno', rpcPayload(tickets[0]));
  assert.equal(forbidden.error?.code, '42501', 'Conta autenticada não recebe permissão de chamar diretamente a RPC.');
  await ok('RPC direta negada à conta de aluno autenticada');
  report.status = 'aprovado';
} catch (error) {
  report.status = 'falhou';
  // Mensagens de asserção são próprias do teste; respostas, tokens e chaves não são impressos.
  report.error = error instanceof assert.AssertionError || error?.name === 'TestOperationError'
    ? error.message.split('\n')[0] : 'Operação falhou; confira configuração/conectividade e a última etapa registrada.';
  console.error(report.error); process.exitCode = 1;
} finally {
  // Fecha somente as provas geradas por esta execução, mesmo após falha.
  if (report.exams.length) {
    const closed = await admin.from('provas').update({ prazo_envio: new Date(Date.now() - 60000).toISOString(), excecoes_envio: {} }).in('id', report.exams);
    report.fixturesClosed = !closed.error;
    if (closed.error) { report.status = 'falhou ao fechar fixtures'; process.exitCode = 1; }
  }
  report.completedAt = new Date().toISOString(); await save();
  console.log(`Relatório sem credenciais: ${folder}/resultado.json. Contas e fixtures identificadas foram mantidas.`);
}
