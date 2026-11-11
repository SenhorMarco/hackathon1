// Smoke real da publicação transacional, sem navegador e sem chamadas de IA.
// node scripts/testar-publicacao-deploy.mjs https://hackathon1-blond.vercel.app --criar-dados-sinteticos
// Configure somente as quatro variáveis Supabase em .env.local; nunca as passe na CLI.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import ts from 'typescript';

const target = process.argv[2];
if (!target || !process.argv.includes('--criar-dados-sinteticos')) {
  throw Error('Informe o deploy confiável e --criar-dados-sinteticos. As fixtures serão mantidas para auditoria.');
}
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const base = new URL(target).origin;
const expectedOrigin = 'https://hackathon1-blond.vercel.app';
assert.equal(base, expectedOrigin, 'Destino diferente do deploy confiável.');
const provider = process.env.SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, '');
const publicProvider = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
if (!provider || !publicProvider || !serviceKey || !publicKey) throw Error('Faltam as quatro variáveis Supabase em .env.local. Não compartilhe chaves no chat.');
assert.equal(new URL(provider).origin, new URL(publicProvider).origin, 'As URLs devem apontar ao mesmo projeto.');
const timeoutFetch = (input, init = {}) => fetch(input, { ...init,
  signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000) });
const sdkOptions = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: timeoutFetch } };
const admin = createClient(provider, serviceKey, sdkOptions);
const anon = createClient(publicProvider, publicKey, sdkOptions);
const label = `TESTE_PUBLICACAO_${Date.now()}`;
const folder = `tmp/${label}`;
await mkdir(folder, { recursive: true });
const report = { label, base, startedAt: new Date().toISOString(), status: 'em andamento', checks: [], users: [], room: null, exams: [], submissions: [], feedbacks: [], aiCalls: 0 };
const save = () => writeFile(`${folder}/resultado.json`, JSON.stringify(report, null, 2));
const ok = async (name, details = {}) => { report.checks.push({ name, ...details }); await save(); console.log(`OK: ${name}`); };
const checked = (result, operation) => {
  if (result.error) {
    const code = /^[a-z0-9_-]+$/i.test(result.error.code || '') ? result.error.code : 'falha';
    const error = Error(`${operation}: ${code}`); error.name = 'TestOperationError'; throw error;
  }
  return result.data;
};
const compiled = ts.transpileModule(readFileSync('src/lib/review-revision.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/import \{ FeedbackAluno \} from ['"]\.\/ai\/schemas['"];?/, 'const FeedbackAluno = {};');
const { reviewRevision } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const barema = { questoes: [
  { numero: 1, valorTotal: 2, criterios: [{ id: 'q1-c1', descricao: 'Critério sintético da questão 1.', pontos: 2 }] },
  { numero: 2, valorTotal: 3, criterios: [{ id: 'q2-c1', descricao: 'Critério sintético da questão 2.', pontos: 3 }] },
] };
const analise = { questoes: [1, 2].map(numero => ({ numero, enunciado: `Enunciado sintético da questão ${numero}.`, conteudo: 'Aritmética',
  resolucao: { passos: ['Resolução sintética.'], respostaFinal: `${numero}` }, existenciaResposta: { status: 'unica', observacao: 'Fixture de validação.' },
  problemasEnunciado: [], dificuldadeEstimada: 'facil', justificativaDificuldade: 'Questão curta de teste.' })), observacoesGerais: 'Prova sintética para smoke test.' };
const feedbackContent = aluno => ({ resumo: `Devolutiva sintética para ${aluno}. Resumo revisado manualmente.`,
  questoes: [1, 2].map(numero => ({ numero, acertos: 'Resposta revisada pelo professor.', erro: '', porque: '', dica: 'Continue praticando.', exercicios: [] })),
  proximosPassos: ['Revisar os conceitos da prova.'] });

async function user(role, suffix) {
  const email = `qa-publicacao-${randomUUID()}@example.com`;
  const password = `${randomUUID()}!aA9`;
  assert.ok(password.length <= 72, 'Senha sintética deve respeitar o limite do provedor.');
  const data = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { nome: `${label} ${suffix}`, papel: role } }), 'Criar conta sintética');
  report.users.push({ id: data.user.id, role, suffix }); await save();
  const jar = new Map();
  const auth = createServerClient(publicProvider, publicKey, { auth: { autoRefreshToken: false }, global: { fetch: timeoutFetch },
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: values => values.forEach(value => jar.set(value.name, value.value)) } });
  checked(await auth.auth.signInWithPassword({ email, password }), 'Entrar na conta sintética');
  return { id: data.user.id, email, auth, cookie: () => [...jar].map(([key, value]) => `${key}=${value}`).join('; ') };
}
async function request(actor, path, method = 'GET', body) {
  const response = await fetch(base + path, { method, redirect: 'manual',
    headers: { ...(actor ? { cookie: actor.cookie() } : {}), origin: base,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}
const releasePath = examId => `/api/exams/${examId}/release`;
const answerPath = (examId, answerId) => `/api/exams/${examId}/answers/${answerId}`;
const feedbackPath = (examId, submissionId) => `/api/exams/${examId}/submissions/${submissionId}/feedback`;
const readRows = async (table, key, value) => checked(await admin.from(table).select('*').eq(key, value), `Consultar ${table} sintéticas`);
const fullFeedback = (submission, answers, aluno) => ({ ...feedbackContent(aluno), __revisao: reviewRevision({ barema, analise }, submission, answers) });
const approveFeedback = async (teacher, examId, submissionId) => {
  const path = feedbackPath(examId, submissionId);
  const current = await request(teacher, path);
  assert.equal(current.status, 200, 'Carregar devolutiva sintética para aprovação.');
  const saved = await request(teacher, path, 'PUT', { conteudo: current.data.feedback.conteudo, revisao: current.data.feedback.revisao });
  assert.equal(saved.status, 200, 'Aprovar devolutiva sintética pela API.');
};

await save();
try {
  const teacher = await user('professor', 'PROFESSOR');
  const students = [await user('aluno', 'ALUNO_A'), await user('aluno', 'ALUNO_B')];
  const roomId = randomUUID(); report.room = roomId; await save();
  checked(await admin.from('turmas').insert({ id: roomId, nome: label, professor_id: teacher.id, disciplina: 'Física', turno: 'Manhã' }), 'Criar turma sintética');
  const studentIds = [randomUUID(), randomUUID()];
  checked(await admin.from('alunos').insert(students.map((student, index) => ({ id: studentIds[index], turma_id: roomId,
    nome: `${label} ALUNO ${index + 1}`, email: student.email }))), 'Vincular alunos sintéticos às contas');

  const examId = randomUUID(); report.exams.push(examId); await save();
  checked(await admin.from('provas').insert({ id: examId, turma_id: roomId, titulo: label, status: 'corrigindo', analise, barema, barema_origem: 'analisado' }), 'Criar prova sintética corrigindo');
  const submissionIds = [randomUUID(), randomUUID()]; report.submissions = submissionIds; await save();
  checked(await admin.from('submissoes').insert(submissionIds.map((id, index) => ({ id, prova_id: examId, aluno_id: studentIds[index],
    arquivo_paths: [], arquivo_nomes: [], status: 'corrigida' }))), 'Criar duas submissões sintéticas corrigidas');

  const answerIds = submissionIds.map(() => [randomUUID(), randomUUID()]);
  const answerRows = submissionIds.flatMap((submissao_id, index) => [1].map(numero => ({ id: answerIds[index][numero - 1], prova_id: examId, submissao_id, numero,
    correcao: { numero, transcricao: `Resposta sintética do aluno ${index + 1}, questão 1.`, legivel: true, passos: [], metodo: 'padrao', descricaoMetodo: 'Fixture manual.',
      tipoErro: 'nenhum', primeiroPassoErrado: null, criteriosAtendidos: ['q1-c1'], notaSugerida: 2, justificativa: 'Correção sintética.' },
    nota_final: null, comentario_final: null, grupo_id: null })));
  checked(await admin.from('respostas').insert(answerRows), 'Criar respostas parciais sintéticas');

  assert.equal((await request(null, releasePath(examId), 'POST', {})).status, 401, 'Liberação sem conta recebe 401.');
  assert.equal((await request(students[0], releasePath(examId), 'POST', {})).status, 403, 'Aluno não pode liberar prova.');
  const partial = await request(teacher, releasePath(examId), 'POST', {});
  assert.equal(partial.status, 409, 'Prova parcial com Q2 ausente não libera.');
  await ok('A API nega publicação anônima, para alunos, e bloqueia submissões sem todas as respostas');

  for (let index = 0; index < 2; index++) {
    const q1 = answerRows[index];
    const saved = await request(teacher, answerPath(examId, q1.id), 'PATCH', { nota: 2, comentario: `Nota sintética do aluno ${index + 1}, Q1.` });
    assert.equal(saved.status, 200, 'Validar nota de Q1 pela API.');
  }
  const q2Rows = submissionIds.map((submissao_id, index) => ({ id: answerIds[index][1], prova_id: examId, submissao_id, numero: 2,
    correcao: { numero: 2, transcricao: `Resposta sintética do aluno ${index + 1}, questão 2.`, legivel: true, passos: [], metodo: 'padrao', descricaoMetodo: 'Fixture manual.',
      tipoErro: 'nenhum', primeiroPassoErrado: null, criteriosAtendidos: ['q2-c1'], notaSugerida: 3, justificativa: 'Correção sintética.' },
    nota_final: null, comentario_final: null, grupo_id: null }));
  checked(await admin.from('respostas').insert(q2Rows), 'Completar linhas de resposta com Q2 ainda pendente');
  const overLimit = await request(teacher, answerPath(examId, answerIds[0][1]), 'PATCH', { nota: 4, comentario: 'Nota acima do teto.' });
  assert.equal(overLimit.status, 400, 'A API impede nota acima do teto na própria gravação.');
  assert.equal((await request(teacher, releasePath(examId), 'POST', {})).status, 409, 'Questões ainda pendentes bloqueiam publicação.');
  for (let index = 0; index < 2; index++) {
    const saved = await request(teacher, answerPath(examId, answerIds[index][1]), 'PATCH', {
      nota: index === 0 ? 3 : 2, comentario: `Nota sintética do aluno ${index + 1}, Q2.`,
    });
    assert.equal(saved.status, 200, 'Validar nota de Q2 pela API.');
  }
  await ok('Notas são validadas pela API dentro dos tetos e questões pendentes bloqueiam publicação');

  const missingFeedback = await request(teacher, releasePath(examId), 'POST', {});
  assert.equal(missingFeedback.status, 409, 'Falta de devolutivas bloqueia liberação.');
  const feedbackRows = [];
  for (let index = 0; index < 2; index++) {
    const submission = (await readRows('submissoes', 'id', submissionIds[index]))[0];
    const answers = await readRows('respostas', 'submissao_id', submissionIds[index]);
    const inserted = checked(await admin.from('feedbacks').insert({ submissao_id: submissionIds[index], conteudo: fullFeedback(submission, answers, `aluno ${index + 1}`), publicado: false })
      .select('id,token,submissao_id').single(), 'Criar devolutiva sintética sem aprovação');
    feedbackRows.push(inserted);
    report.feedbacks.push({ id: inserted.id, submissionId: inserted.submissao_id, token: inserted.token }); await save();
  }
  assert.equal((await request(teacher, releasePath(examId), 'POST', {})).status, 409, 'Devolutivas sem aprovação humana bloqueiam liberação.');
  await approveFeedback(teacher, examId, submissionIds[0]);
  assert.equal((await request(teacher, releasePath(examId), 'POST', {})).status, 409, 'A aprovação parcial da turma não libera.');
  await approveFeedback(teacher, examId, submissionIds[1]);
  await ok('Publicação bloqueia feedback ausente e espera aprovação de cada aluno');

  // Simula edição de uma nota pelo administrador para preservar o feedback antigo e provar o bloqueio por hash.
  checked(await admin.from('respostas').update({ nota_final: 1.5 }).eq('id', answerIds[0][1]), 'Alterar nota antes da publicação para invalidar devolutiva');
  const outdated = await request(teacher, releasePath(examId), 'POST', {});
  assert.equal(outdated.status, 409, 'Hash antigo do feedback depois de mudança de nota bloqueia publicação.');
  const firstSubmission = (await readRows('submissoes', 'id', submissionIds[0]))[0];
  const firstAnswers = await readRows('respostas', 'submissao_id', submissionIds[0]);
  const revisedContent = { ...feedbackContent('aluno 1'), __revisao: reviewRevision({ barema, analise }, firstSubmission, firstAnswers) };
  checked(await admin.from('feedbacks').update({ conteudo: revisedContent, publicado: false }).eq('submissao_id', submissionIds[0]), 'Atualizar devolutiva sintética após a nota');
  await approveFeedback(teacher, examId, submissionIds[0]);
  await ok('Devolutiva com hash antigo é recusada; após atualizar e aprovar novamente, fica pronta para publicar');

  await ok('Ambas as devolutivas estão aprovadas; iniciando verificações diretas da RPC');
  const snapshotResult = await admin.rpc('snapshot_publicacao', { p_prova: examId });
  const snapshot = checked(snapshotResult, 'Capturar snapshot real da prova sintética');
  const wrongTeacher = await admin.rpc('publicar_prova', { p_prova: examId, p_professor: randomUUID(), p_snapshot: snapshot });
  assert.equal(wrongTeacher.error?.code, 'P0002', 'Professor de outra turma recebe prova não encontrada pela RPC.');
  const deniedAnon = await anon.rpc('publicar_prova', { p_prova: examId, p_professor: teacher.id, p_snapshot: snapshot });
  assert.equal(deniedAnon.error?.code, '42501', 'Cliente anônimo não tem permissão de executar a RPC.');
  const deniedStudent = await students[0].auth.rpc('publicar_prova', { p_prova: examId, p_professor: teacher.id, p_snapshot: snapshot });
  assert.equal(deniedStudent.error?.code, '42501', 'Cliente autenticado como aluno não tem permissão de executar a RPC.');
  checked(await admin.from('respostas').update({ nota_final: 2.5 }).eq('id', answerIds[0][1]), 'Provocar mudança concorrente após capturar snapshot');
  const staleSnapshot = await admin.rpc('publicar_prova', { p_prova: examId, p_professor: teacher.id, p_snapshot: snapshot });
  assert.equal(staleSnapshot.error?.code, 'PT409', 'Snapshot antigo é recusado pela comparação transacional.');
  const unchangedAfterRace = (await readRows('provas', 'id', examId))[0];
  const feedbackAfterRace = checked(await admin.from('feedbacks').select('*').in('submissao_id', submissionIds), 'Conferir devolutivas após corrida');
  assert.equal(unchangedAfterRace.status, 'corrigindo');
  assert.equal(feedbackAfterRace.length, 2);
  assert.ok(feedbackAfterRace.every(row => !row.publicado), 'Corrida não publica nenhum feedback de qualquer aluno.');
  checked(await admin.from('respostas').update({ nota_final: 1.5 }).eq('id', answerIds[0][1]), 'Restaurar nota e snapshot aprovado');
  await ok('RPC reserva publicação ao professor da turma; anônimo/aluno recebem 42501 e snapshot concorrente PT409 sem publicação parcial');

  const published = await request(teacher, releasePath(examId), 'POST', {});
  assert.equal(published.status, 200, 'Prova pronta é publicada pela API.');
  const repeat = await request(teacher, releasePath(examId), 'POST', {});
  assert.equal(repeat.status, 200, 'Repetir a publicação é idempotente.');
  let proof = (await readRows('provas', 'id', examId))[0];
  assert.equal(proof.status, 'corrigida');
  for (const submissionId of submissionIds) {
    const rows = await readRows('feedbacks', 'submissao_id', submissionId);
    assert.equal(rows.length, 1); assert.equal(rows[0].publicado, true);
  }
  await ok('Prova e duas devolutivas publicadas atomicamente; repetição retorna sucesso sem duplicação');

  for (let index = 0; index < 2; index++) {
    const token = report.feedbacks.find(row => row.submissionId === submissionIds[index]).token;
    const page = await fetch(`${base}/aluno/${token}`, { redirect: 'manual', headers: { cookie: students[index].cookie() }, signal: AbortSignal.timeout(45000) });
    const html = await page.text();
    assert.equal(page.status, 200, `Aluno ${index + 1} consegue abrir sua devolutiva.`);
    assert.ok(html.includes('Questão 1') && html.includes('Questão 2'), `Aluno ${index + 1} vê suas duas questões.`);
  }
  const wrongStudentPage = await fetch(`${base}/aluno/${report.feedbacks.find(row => row.submissionId === submissionIds[1]).token}`, {
    redirect: 'manual', headers: { cookie: students[0].cookie() }, signal: AbortSignal.timeout(45000),
  });
  await wrongStudentPage.text();
  assert.equal(wrongStudentPage.status, 404, 'Aluno não abre a devolutiva do outro aluno.');
  await ok('Cada aluno abre sua devolutiva publicada; o outro token é negado');

  const beforePostPublish = {
    proof: (await readRows('provas', 'id', examId))[0],
    submissions: await readRows('submissoes', 'prova_id', examId),
    answers: await readRows('respostas', 'prova_id', examId),
    feedbacks: await admin.from('feedbacks').select('*').in('submissao_id', submissionIds).then(result => checked(result, 'Salvar estado publicado das devolutivas')),
  };
  const rejectedGrade = await request(teacher, answerPath(examId, answerIds[0][0]), 'PATCH', { nota: 1, comentario: 'Tentativa posterior à publicação.' });
  assert.equal(rejectedGrade.status, 409, 'PATCH de nota após publicação recebe 409.');
  const postFeedbackPath = feedbackPath(examId, submissionIds[0]);
  const oldFeedback = await request(teacher, postFeedbackPath);
  assert.equal(oldFeedback.status, 200);
  const rejectedFeedback = await request(teacher, postFeedbackPath, 'PUT', { conteudo: oldFeedback.data.feedback.conteudo, revisao: oldFeedback.data.feedback.revisao });
  assert.equal(rejectedFeedback.status, 409, 'PUT de feedback após publicação recebe 409.');
  const proofRead = await request(teacher, `/api/exams/${examId}`);
  assert.equal(proofRead.status, 200);
  const rejectedRubric = await request(teacher, `/api/exams/${examId}/rubric`, 'PUT', { analise, barema, revisao: proofRead.data.prova.revisao });
  assert.equal(rejectedRubric.status, 409, 'Alteração do barema após publicação recebe 409.');
  const rejectedUpload = await request(students[0], `/api/aluno/provas/${examId}/envio`, 'PUT', {
    files: [{ name: 'sintetico.png', type: 'image/png', size: 68 }],
  });
  assert.equal(rejectedUpload.status, 409, 'Envio de aluno após publicação recebe 409.');
  const adminWrite = await admin.from('respostas').update({ nota_final: 0 }).eq('id', answerIds[0][0]);
  assert.equal(adminWrite.error?.code, '55000', 'Escrita administrativa direta em resposta publicada é bloqueada pelo banco.');
  const adminFileWrite = await admin.from('submissoes').update({ arquivo_paths: ['tentativa-pos-publicacao.png'] }).eq('id', submissionIds[0]);
  assert.equal(adminFileWrite.error?.code, '55000', 'Escrita administrativa direta em arquivos de submissão publicada é bloqueada pelo banco.');
  const adminRubricWrite = await admin.from('provas').update({ barema: { ...barema, questoes: barema.questoes.map((question, i) => i ? question : { ...question, valorTotal: 1 }) } }).eq('id', examId);
  assert.equal(adminRubricWrite.error?.code, '55000', 'Escrita administrativa direta no barema publicado é bloqueada pelo banco.');
  proof = (await readRows('provas', 'id', examId))[0];
  const afterPostPublish = {
    submissions: await readRows('submissoes', 'prova_id', examId),
    answers: await readRows('respostas', 'prova_id', examId),
    feedbacks: await admin.from('feedbacks').select('*').in('submissao_id', submissionIds).then(result => checked(result, 'Conferir estado publicado das devolutivas')),
  };
  assert.equal(proof.status, 'corrigida');
  assert.deepEqual(proof, beforePostPublish.proof, 'Escrita direta não altera a prova publicada.');
  assert.deepEqual(afterPostPublish.submissions, beforePostPublish.submissions, 'Upload recusado não altera arquivos/envios.');
  assert.deepEqual(afterPostPublish.answers, beforePostPublish.answers, 'Nenhuma tentativa alterou as notas.');
  assert.deepEqual(afterPostPublish.feedbacks, beforePostPublish.feedbacks, 'Nenhuma tentativa alterou devolutivas publicadas.');
  await ok('PATCH nota, PUT feedback, barema, upload e escrita administrativa ficam bloqueados após publicação sem alterar os dados');
  report.status = 'aprovado';
} catch (error) {
  report.status = 'falhou';
  report.error = error instanceof assert.AssertionError || error?.name === 'TestOperationError'
    ? String(error.message).split('\n')[0] : 'Operação falhou; confira a configuração e a última etapa registrada.';
  console.error(report.error); process.exitCode = 1;
} finally {
  if (report.exams.length) {
    const closed = await admin.from('provas').update({ prazo_envio: new Date(Date.now() - 60000).toISOString(), excecoes_envio: {} }).in('id', report.exams);
    report.fixturesClosed = !closed.error;
    if (closed.error) { report.status = 'falhou ao fechar fixtures'; process.exitCode = 1; }
  }
  report.completedAt = new Date().toISOString(); await save();
  console.log(`Relatório sem credenciais de acesso: ${folder}/resultado.json. Contas e fixtures foram mantidas.`);
}
