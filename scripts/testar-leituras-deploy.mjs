// Exercita as decisões reversíveis de leitura no deploy, sem navegador e sem IA.
// node scripts/testar-leituras-deploy.mjs https://seu-deploy --criar-dados-sinteticos
// Configure as quatro variáveis do Supabase em .env.local; nunca as passe na CLI.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import ts from 'typescript';

const target = process.argv[2];
if (!target || !process.argv.includes('--criar-dados-sinteticos')) {
  throw Error('Informe o deploy e --criar-dados-sinteticos. As fixtures serão mantidas para auditoria.');
}
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const base = new URL(target).origin;
const expectedOrigin = process.env.LEITURAS_DEPLOY_ORIGIN || 'https://hackathon1-blond.vercel.app';
assert.equal(base, new URL(expectedOrigin).origin, 'Destino diferente do deploy confiável; configure LEITURAS_DEPLOY_ORIGIN explicitamente para outro ambiente.');
const provider = process.env.SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, '');
const publicProvider = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
if (!provider || !publicProvider || !serviceKey || !publicKey) {
  throw Error('Faltam as quatro variáveis Supabase em .env.local. Não compartilhe chaves no chat.');
}
assert.equal(new URL(provider).origin, new URL(publicProvider).origin, 'As URLs devem apontar ao mesmo projeto.');
const admin = createClient(provider, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const label = `TESTE_LEITURAS_${Date.now()}`;
const folder = `tmp/${label}`;
await mkdir(folder, { recursive: true });
const report = { label, base, startedAt: new Date().toISOString(), status: 'em andamento', checks: [], users: [], exams: [], files: [], aiCalls: 0 };
const save = () => writeFile(`${folder}/resultado.json`, JSON.stringify(report, null, 2));
const ok = async (name, details = {}) => { report.checks.push({ name, ...details }); await save(); console.log(`OK: ${name}`); };
const checked = (result, operation) => {
  if (result.error) {
    const code = /^[a-z0-9_-]+$/i.test(result.error.code || '') ? result.error.code : 'falha';
    const error = Error(`${operation}: ${code}`); error.name = 'TestOperationError'; throw error;
  }
  return result.data;
};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8mQAAAAASUVORK5CYII=', 'base64');
// Usa o cálculo real para montar a fixture; aprovação e validação continuam na API.
// FeedbackAluno só é usado nas outras funções do módulo, não chamadas pelo runner.
const revisionSource = ts.transpileModule(readFileSync('src/lib/review-revision.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/import \{ FeedbackAluno \} from ['"]\.\/ai\/schemas['"];?/, 'const FeedbackAluno = {};');
const { reviewRevision } = await import(`data:text/javascript;base64,${Buffer.from(revisionSource).toString('base64')}`);

async function user(role, suffix) {
  const email = `qa-leituras-${randomUUID()}@example.com`;
  const password = `${randomUUID()}!aA9`;
  assert.ok(password.length <= 72, 'Senha sintética deve respeitar o limite do provedor.');
  const data = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { nome: `${label} ${suffix}`, papel: role } }), 'Criar conta sintética');
  report.users.push({ id: data.user.id, role, suffix }); await save();
  const jar = new Map();
  const auth = createServerClient(publicProvider, publicKey, { auth: { autoRefreshToken: false },
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
const answerPath = (examId, answerId) => `/api/exams/${examId}/answers/${answerId}`;
const readingPath = (examId, answerId) => `${answerPath(examId, answerId)}/reading`;
const reviewPath = examId => `/api/exams/${examId}/review`;
const releasePath = examId => `/api/exams/${examId}/release`;
const submissionsPath = (examId, submissionId) => `/api/exams/${examId}/submissions/${submissionId}`;
const manualPath = (examId, submissionId) => `${submissionsPath(examId, submissionId)}/answers`;
const correctionPath = (examId, submissionId) => `${submissionsPath(examId, submissionId)}/correct`;
const archive = (teacher, examId, answerId, body) => request(teacher, readingPath(examId, answerId), 'POST', body);

const criteria = number => [{ id: `q${number}-criterio`, descricao: `Critério sintético da Q${number}`, pontos: 2 }];
const barema = { questoes: [1, 2, 3, 4].map(numero => ({ numero, valorTotal: 2, criterios: criteria(numero) })) };
const analise = { questoes: [1, 2, 3, 4].map(numero => ({ numero, enunciado: `Enunciado sintético da Q${numero}`,
  conteudo: 'Aritmética', resolucao: { passos: ['Etapa sintética'], respostaFinal: `${numero}` },
  existenciaResposta: { status: 'unica', observacao: 'Fixture determinística.' }, problemasEnunciado: [],
  dificuldadeEstimada: 'facil', justificativaDificuldade: 'Questão curta de fixture.' })), observacoesGerais: 'Prova sintética para validar o fluxo de revisão.' };
function correction(numero, values = {}) {
  return { numero, transcricao: `Transcrição sintética Q${numero}`, legivel: true, passos: [], metodo: 'padrao',
    descricaoMetodo: 'Registro de fixture sem chamada de IA.', tipoErro: 'nenhum', primeiroPassoErrado: null,
    criteriosAtendidos: [], notaSugerida: 0, justificativa: 'Correção sintética para teste de deploy.', ...values };
}
const feedbackContent = { resumo: 'Resumo sintético. Esta devolutiva foi criada manualmente para testar a publicação.',
  questoes: [1, 2, 3, 4].map(numero => ({ numero, acertos: 'Registro conferido.', erro: '', porque: '', dica: 'Continue praticando.', exercicios: [] })),
  proximosPassos: ['Revisar as respostas com o professor.'] };

await save();
try {
  const teacher = await user('professor', 'PROFESSOR');
  const student = await user('aluno', 'ALUNO');
  const room = randomUUID(); report.room = room; await save();
  checked(await admin.from('turmas').insert({ id: room, nome: label, professor_id: teacher.id, disciplina: 'Física', turno: 'Manhã' }), 'Criar turma sintética');
  const studentId = randomUUID();
  checked(await admin.from('alunos').insert({ id: studentId, turma_id: room, nome: `${label} ALUNO`, email: student.email }), 'Vincular conta sintética à turma');

  const examId = randomUUID(); report.exams.push(examId); await save();
  checked(await admin.from('provas').insert({ id: examId, turma_id: room, titulo: `${label} PROVA`, status: 'corrigindo', analise,
    barema, barema_origem: 'analisado' }), 'Criar prova sintética corrigindo');
  const submissionId = randomUUID();
  const filePath = `${examId}/${submissionId}/${randomUUID()}-pagina.png`;
  checked(await admin.storage.from('provas').upload(filePath, png, { contentType: 'image/png', upsert: false }), 'Enviar arquivo sintético ao Storage privado');
  report.files.push(filePath); await save();
  checked(await admin.from('submissoes').insert({ id: submissionId, prova_id: examId, aluno_id: studentId,
    arquivo_paths: [filePath], arquivo_nomes: ['pagina-sintetica.png'], status: 'corrigida' }), 'Criar submissão sintética corrigida');

  const ids = Object.fromEntries([-1, -2, -3, 1, 2].map(numero => [numero, randomUUID()]));
  const rows = [
    { id: ids[1], submissao_id: submissionId, prova_id: examId, numero: 1,
      correcao: correction(1, { transcricao: 'Resposta sintética correta da questão 1.', notaSugerida: 2, criteriosAtendidos: ['q1-criterio'] }),
      nota_final: 2, comentario_final: 'Nota integral sintética; preservar durante a revisão.' },
    { id: ids[2], submissao_id: submissionId, prova_id: examId, numero: 2,
      correcao: correction(2, { legivel: false, transcricao: 'Trecho manuscrito de leitura incerta.', tipoErro: 'incompleto', justificativa: 'A leitura não foi confiável.' }),
      nota_final: null, comentario_final: null },
    { id: ids[-1], submissao_id: submissionId, prova_id: examId, numero: -1,
      correcao: correction(-1, { transcricao: 'Resposta sintética correta da questão 1.', notaSugerida: 0, justificativa: 'Leitura duplicada suspeita.' }),
      nota_final: null, comentario_final: null },
    { id: ids[-2], submissao_id: submissionId, prova_id: examId, numero: -2,
      correcao: correction(-2, { transcricao: 'Resposta manuscrita referente à questão 3.', notaSugerida: 0, justificativa: 'Questão ainda não identificada.' }),
      nota_final: null, comentario_final: null },
    { id: ids[-3], submissao_id: submissionId, prova_id: examId, numero: -3,
      correcao: correction(-3, { transcricao: 'Anotação de agenda sem relação com a avaliação.', notaSugerida: 0, justificativa: 'Trecho não parece fazer parte da prova.' }),
      nota_final: null, comentario_final: null },
  ];
  checked(await admin.from('respostas').insert(rows), 'Criar respostas sintéticas');

  const noAuth = await request(null, readingPath(examId, ids[-1]), 'POST', { acao: 'desconsiderar', tipo: 'duplicada' });
  assert.equal(noAuth.status, 401, 'Endpoint de leitura exige autenticação.');
  const studentDenied = await request(student, readingPath(examId, ids[-1]), 'POST', { acao: 'desconsiderar', tipo: 'duplicada' });
  assert.equal(studentDenied.status, 403, 'Conta de aluno não pode decidir leitura.');
  await ok('A rota de leitura nega acesso anônimo e de aluno');

  let review = await request(teacher, reviewPath(examId));
  assert.equal(review.status, 200); assert.match(review.data.respostas.find(row => row.id === ids[-1]).revisaoLeitura, /^[a-f0-9]{64}$/);
  const initialRelease = await request(teacher, releasePath(examId), 'POST', {});
  assert.equal(initialRelease.status, 409, 'Pendências técnicas impedem a liberação inicial.');
  await ok('Revisão fornece versão da leitura e liberação inicial fica bloqueada');

  const duplicateReason = 'Mesmo texto e mesma página da resposta Q1.';
  const duplicateBody = { acao: 'desconsiderar', tipo: 'duplicada', duplicadaDe: ids[1], motivo: duplicateReason,
    arquivoConferido: true, revisao: review.data.respostas.find(row => row.id === ids[-1]).revisaoLeitura };
  const archivedDuplicate = await archive(teacher, examId, ids[-1], duplicateBody);
  assert.equal(archivedDuplicate.status, 200, 'Arquivar leitura duplicada');
  const repeatedArchive = await archive(teacher, examId, ids[-1], duplicateBody);
  assert.equal(repeatedArchive.status, 200, 'Repetir mesma decisão é idempotente.');
  let persisted = checked(await admin.from('respostas').select('*').eq('id', ids[-1]).single(), 'Conferir linha duplicada preservada');
  assert.equal(persisted.correcao.transcricao, 'Resposta sintética correta da questão 1.');
  assert.equal(persisted.nota_final, null); assert.equal(persisted.comentario_final, null);
  assert.equal(persisted.correcao.historicoLeitura.length, 1, 'Repetição não cria outro evento.');
  const q1 = checked(await admin.from('respostas').select('*').eq('id', ids[1]).single(), 'Conferir nota canônica');
  assert.equal(q1.nota_final, 2); assert.equal(q1.comentario_final, 'Nota integral sintética; preservar durante a revisão.');
  const storedFile = checked(await admin.storage.from('provas').download(filePath), 'Conferir arquivo mantido no Storage');
  assert.equal(storedFile.size, png.length);
  assert.ok(Buffer.from(await storedFile.arrayBuffer()).equals(png), 'Arquivo original preservado byte a byte.');
  await ok('Leitura duplicada fica arquivada sem alterar texto, linha, arquivo ou nota da Q1; repetição não duplica histórico');

  const badRevision = await archive(teacher, examId, ids[-1], { ...duplicateBody, revisao: '0'.repeat(64) });
  assert.equal(badRevision.status, 409, 'Versão antiga ou incorreta da leitura recebe 409.');
  const rerun = await request(teacher, correctionPath(examId, submissionId), 'POST', {});
  assert.equal(rerun.status, 409, 'Nova pré-correção não deve sobrepor revisão humana.');
  const manualWhileUnresolved = await request(teacher, manualPath(examId, submissionId), 'POST', {
    numero: 4, transcricao: 'Resposta manual bloqueada enquanto há pendências.', arquivoConferido: true,
  });
  assert.equal(manualWhileUnresolved.status, 409, 'Leituras -2 e -3 ainda bloqueiam respostas manuais.');
  await ok('Versão desatualizada, nova pré-correção e resposta manual durante pendências recebem 409');

  review = await request(teacher, reviewPath(examId));
  const outsideBody = { acao: 'desconsiderar', tipo: 'fora_da_prova', motivo: 'Arquivo mostra uma anotação de agenda, fora da avaliação.',
    arquivoConferido: true, revisao: review.data.respostas.find(row => row.id === ids[-3]).revisaoLeitura };
  assert.equal((await archive(teacher, examId, ids[-3], outsideBody)).status, 200, 'Arquivar somente conteúdo claramente fora da prova.');
  const association = await request(teacher, `${answerPath(examId, ids[-2])}/associate`, 'POST', { numero: 3 });
  assert.equal(association.status, 200, 'Associar a resposta pendente à questão 3.');
  const wrongQ3Grade = await request(teacher, answerPath(examId, ids[-2]), 'PATCH', { nota: 1, comentario: 'Resposta conferida.', leituraConferida: false });
  assert.equal(wrongQ3Grade.status, 409, 'Associação manual exige conferência da leitura.');
  const q3Grade = await request(teacher, answerPath(examId, ids[-2]), 'PATCH', { nota: 1, comentario: 'Resposta conferida no arquivo.', leituraConferida: true });
  assert.equal(q3Grade.status, 200, 'Validar resposta associada após conferir o arquivo.');
  persisted = checked(await admin.from('respostas').select('*').eq('id', ids[-2]).single(), 'Conferir associação e leitura revisada');
  assert.equal(persisted.numero, 3); assert.equal(persisted.correcao.legivel, true);
  assert.equal(persisted.correcao.legibilidadeOriginal, false);
  await ok('Conteúdo fora da prova arquivado explicitamente; leitura associada exige conferência e conserva a legibilidade original');

  const q2Unchecked = await request(teacher, answerPath(examId, ids[2]), 'PATCH', { nota: 1, comentario: 'Tentativa sem conferir.', leituraConferida: false });
  assert.equal(q2Unchecked.status, 409, 'Q2 sem leitura legível não aceita validação sem conferência.');
  persisted = checked(await admin.from('respostas').select('*').eq('id', ids[2]).single(), 'Conferir Q2 ainda pendente');
  assert.equal(persisted.nota_final, null); assert.equal(persisted.comentario_final, null);
  const q2Grade = await request(teacher, answerPath(examId, ids[2]), 'PATCH', { nota: 1, comentario: 'Leitura conferida no arquivo original.', leituraConferida: true });
  assert.equal(q2Grade.status, 200, 'Conferência humana libera validação de Q2.');
  persisted = checked(await admin.from('respostas').select('*').eq('id', ids[2]).single(), 'Conferir Q2 após validação');
  assert.equal(persisted.nota_final, 1); assert.equal(persisted.correcao.legivel, true);
  assert.equal(persisted.correcao.legibilidadeOriginal, false);
  await ok('Questão com leitura incerta permanece sem nota até o professor conferir o arquivo');

  // Restauração voluntária devolve a leitura à fila e volta a bloquear registros manuais.
  review = await request(teacher, reviewPath(examId));
  let reopen = await request(teacher, readingPath(examId, ids[-1]), 'POST', {
    acao: 'reabrir', revisao: review.data.respostas.find(row => row.id === ids[-1]).revisaoLeitura,
  });
  assert.equal(reopen.status, 200, 'Reabrir a leitura arquivada.');
  const reopenRelease = await request(teacher, releasePath(examId), 'POST', {});
  assert.equal(reopenRelease.status, 409, 'Reabrir pendência volta a bloquear liberação.');
  const reopenManual = await request(teacher, manualPath(examId, submissionId), 'POST', {
    numero: 4, transcricao: 'Resposta manual bloqueada após reabrir pendência.', arquivoConferido: true,
  });
  assert.equal(reopenManual.status, 409, 'Pendência reaberta volta a bloquear resposta manual.');
  const manualMissing = await request(teacher, manualPath(examId, submissionId), 'POST', { numero: 4, transcricao: '', arquivoConferido: true });
  assert.equal(manualMissing.status, 400, 'Texto ausente não pode ser informado como questão respondida.');
  const manualIllegible = await request(teacher, manualPath(examId, submissionId), 'POST', {
    numero: 4, transcricao: '', situacao: 'ilegivel', arquivoConferido: true,
  });
  assert.equal(manualIllegible.status, 400, 'Ilegibilidade não é uma situação para registrar como resposta em branco.');
  assert.equal((await request(teacher, manualPath(examId, submissionId), 'POST', {
    numero: 4, transcricao: '', situacao: 'ausente', arquivoConferido: true,
  })).status, 400, 'Página ausente continua pendente.');
  review = await request(teacher, reviewPath(examId));
  const rearchiveBody = { ...duplicateBody, revisao: review.data.respostas.find(row => row.id === ids[-1]).revisaoLeitura };
  assert.equal((await archive(teacher, examId, ids[-1], rearchiveBody)).status, 200, 'Arquivar novamente após reabrir.');
  persisted = checked(await admin.from('respostas').select('*').eq('id', ids[-1]).single(), 'Conferir histórico após reabrir');
  assert.equal(persisted.correcao.historicoLeitura.length, 3, 'Histórico registra arquivamento, reabertura e novo arquivamento.');
  await ok('Reabrir a leitura restaura bloqueios; texto ausente/ilegível não vira resposta em branco; novo arquivamento fica registrado');

  const blank = await request(teacher, manualPath(examId, submissionId), 'POST', {
    numero: 4, transcricao: '', situacao: 'em_branco', arquivoConferido: true,
  });
  assert.equal(blank.status, 201, 'Página realmente em branco pode ser registrada com confirmação explícita.');
  assert.equal(blank.data.resposta.nota_final, null, 'O registro não atribui zero automaticamente.');
  assert.equal(blank.data.resposta.comentario_final, null);
  const q4Id = blank.data.resposta.id;
  const duplicateQ4 = await request(teacher, manualPath(examId, submissionId), 'POST', {
    numero: 4, transcricao: '', situacao: 'em_branco', arquivoConferido: true,
  });
  assert.equal(duplicateQ4.status, 409, 'Não criar uma segunda resposta na questão 4.');
  const q4Grade = await request(teacher, answerPath(examId, q4Id), 'PATCH', { nota: 0, comentario: 'Questão em branco, conferida no arquivo.', leituraConferida: true });
  assert.equal(q4Grade.status, 200, 'Resposta em branco pode receber nota explícita zero.');
  await ok('Questão Q4 em branco registrada sem nota automática; duplicação bloqueada e nota zero explícita permitida');

  review = await request(teacher, reviewPath(examId));
  const latestRows = checked(await admin.from('respostas').select('*').eq('submissao_id', submissionId), 'Reunir respostas finais da fixture');
  const syntheticSubmission = checked(await admin.from('submissoes').select('*').eq('id', submissionId).single(), 'Reunir submissão final da fixture');
  const revisionForFeedback = reviewRevision({ barema, analise }, syntheticSubmission, latestRows);
  checked(await admin.from('feedbacks').upsert({ submissao_id: submissionId,
    conteudo: { ...feedbackContent, __revisao: revisionForFeedback }, publicado: false }, { onConflict: 'submissao_id' }), 'Preparar devolutiva manual para revisão');
  const feedbackPath = `${submissionsPath(examId, submissionId)}/feedback`;
  const feedbackGet = await request(teacher, feedbackPath);
  assert.equal(feedbackGet.status, 200, 'Carregar devolutiva sintética para aprovação.');
  const feedbackPut = await request(teacher, feedbackPath, 'PUT', { conteudo: feedbackContent, revisao: feedbackGet.data.feedback.revisao });
  assert.equal(feedbackPut.status, 200, 'Aprovar devolutiva sintética com revisão atual.');
  const finalRelease = await request(teacher, releasePath(examId), 'POST', {});
  assert.equal(finalRelease.status, 200, 'Liberar a prova após corrigir e aprovar feedback.');
  const published = checked(await admin.from('feedbacks').select('token,publicado').eq('submissao_id', submissionId).single(), 'Conferir publicação sintética');
  assert.equal(published.publicado, true);
  await ok('Correções completas e devolutiva manual revisada permitem a liberação');

  const studentPage = await fetch(`${base}/aluno/${published.token}`, { redirect: 'manual', headers: { cookie: student.cookie() }, signal: AbortSignal.timeout(45000) });
  const studentHtml = await studentPage.text();
  assert.equal(studentPage.status, 200, 'Aluno vinculado consegue abrir a devolutiva publicada.');
  assert.ok(studentHtml.replace(/<!--[\s\S]*?-->/g, '').includes('Questão 4'), 'A página do aluno inclui questão Q4.');
  assert.ok(!studentHtml.includes('Correção em revisão'), 'A página publicada não exibe estado de revisão.');
  assert.ok(!studentHtml.includes('Anotação de agenda sem relação com a avaliação.'), 'Texto arquivado de fora da prova não aparece ao aluno.');
  review = await request(teacher, reviewPath(examId));
  const afterPublishReopen = await request(teacher, readingPath(examId, ids[-1]), 'POST', {
    acao: 'reabrir', revisao: review.data.respostas.find(row => row.id === ids[-1]).revisaoLeitura,
  });
  assert.equal(afterPublishReopen.status, 409, 'Decisão não pode ser reaberta após publicação.');
  await ok('Aluno vê apenas a devolutiva publicada; texto arquivado fica oculto e a publicação impede reabertura');
  report.status = 'aprovado';
} catch (error) {
  report.status = 'falhou';
  report.error = error instanceof assert.AssertionError || error?.name === 'TestOperationError'
    ? String(error.message).split('\n')[0] : 'Operação falhou; confira configuração/conectividade e a última etapa registrada.';
  console.error(report.error); process.exitCode = 1;
} finally {
  // Fecha somente a prova sintética desta execução e não apaga fixtures ou contas.
  if (report.exams.length) {
    const closed = await admin.from('provas').update({ prazo_envio: new Date(Date.now() - 60000).toISOString(), excecoes_envio: {} }).in('id', report.exams);
    report.fixturesClosed = !closed.error;
    if (closed.error) { report.status = 'falhou ao fechar fixtures'; process.exitCode = 1; }
  }
  report.completedAt = new Date().toISOString(); await save();
  console.log(`Relatório sem credenciais: ${folder}/resultado.json. Contas e fixtures sintéticas foram mantidas.`);
}
