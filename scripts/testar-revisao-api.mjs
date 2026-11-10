// Execute: node --experimental-vm-modules scripts/testar-revisao-api.mjs
// Exercita os handlers reais com banco em memória. Autorização: testar-contas.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';

const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const helpers = await import(`data:text/javascript;base64,${Buffer.from(compile('src/lib/review.ts')).toString('base64')}`);
const feedbackQuestionSchema = z.object({ numero: z.number(), acertos: z.string(), erro: z.string(), porque: z.string(), dica: z.string(), exercicios: z.array(z.object({ enunciado: z.string(), resposta: z.string() })) });
const feedbackSchema = z.object({ resumo: z.string(), questoes: z.array(feedbackQuestionSchema), proximosPassos: z.array(z.string()) });
const revisionSource = compile('src/lib/review-revision.ts').replace("from './ai/schemas'", "from 'schema'");
const revisionContext = vm.createContext({});
const revisionModule = new vm.SourceTextModule(revisionSource, { context: revisionContext });
await revisionModule.link(specifier => {
  if (specifier === 'schema') return new vm.SyntheticModule(['FeedbackAluno'], function () { this.setExport('FeedbackAluno', feedbackSchema); }, { context: revisionContext });
  if (specifier === 'node:crypto') return new vm.SyntheticModule(['createHash'], function () { this.setExport('createHash', (algorithm) => createHash(algorithm)); }, { context: revisionContext });
  throw new Error(`Import inesperado em review-revision: ${specifier}`);
});
await revisionModule.evaluate();
const revisionHelpers = revisionModule.namespace;
import { createHash } from 'node:crypto';
const examId = '10000000-0000-4000-8000-000000000001';
const answerId = '10000000-0000-4000-8000-000000000002';
const submissionId = '10000000-0000-4000-8000-000000000003';
const teacherUUID = '10000000-0000-4000-8000-000000000008';
let tables;
let generatedFeedbackInvalid = false;
let generatedFeedbackInput;
let raceAssociation = false;
function reset() {
  tables = {
    provas: [{ id: examId, status: 'corrigindo', analise: { questoes: [] }, barema: { questoes: [{ numero: 1, valorTotal: 2 }, { numero: 2, valorTotal: 3 }] } }],
    submissoes: [{ id: submissionId, prova_id: examId, aluno_id: 'student', arquivo_paths: ['file-1'], status: 'corrigida' }],
    respostas: [1, 2].map((numero, i) => ({ id: i ? 'second-answer' : answerId, prova_id: examId, submissao_id: submissionId, numero, nota_final: 1, comentario_final: 'Comentário revisado', correcao: { legivel: true } })),
    feedbacks: [{ submissao_id: submissionId, token: 'abc', publicado: false }],
  };
}
function approvedContent(submission, answers) {
  const revision = revisionHelpers.reviewRevision(tables.provas[0], submission, answers);
  return { resumo: 'Devolutiva revisada', questoes: [1, 2].map(numero => ({ numero, acertos: 'Bom trabalho', erro: '', porque: '', dica: 'Continue praticando', exercicios: [] })), proximosPassos: ['Revise os conceitos'], __revisao: revision, __aprovadoEm: new Date().toISOString() };
}
function stableJson(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return value; }
  }
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableJson(item)]));
  return value;
}
const sameJson = (left, right) => JSON.stringify(stableJson(left)) === JSON.stringify(stableJson(right));
function db() {
  return { from(table) {
    const filters = []; let action = 'select', values, single = false;
    const query = {
      select() { return query; }, eq(key, value) { filters.push(row => ['conteudo', 'correcao'].includes(key) && typeof value === 'string' ? sameJson(row[key], value) : row[key] === value); return query; },
      is(key, value) { filters.push(row => row[key] === value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      order() { return query; }, single() { single = true; return query; }, maybeSingle() { single = true; return query; },
      update(data) { action = 'update'; values = data; return query; }, delete() { action = 'delete'; return query; },
      upsert(data) { action = 'upsert'; values = data; return query; },
      insert(data) { action = 'insert'; values = data; return query; },
      then(resolve, reject) {
        try {
          let error = null;
          if (raceAssociation && table === 'respostas' && action === 'update') {
            const pending = tables.respostas.find(row => row.numero < 0);
            if (pending) pending.numero = -99;
            raceAssociation = false;
          }
          let rows = tables[table].filter(row => filters.every(filter => filter(row)));
          if (action === 'delete') tables[table] = tables[table].filter(row => !rows.includes(row));
          if (action === 'update') rows.forEach(row => Object.assign(row, values));
          if (action === 'upsert') { const row = tables[table].find(r => r.submissao_id === values.submissao_id); if (row) Object.assign(row, values); else tables[table].push(values); rows = [row ?? values]; }
          if (action === 'insert') {
            const inserts = Array.isArray(values) ? values : [values];
            const conflict = inserts.some(insert => tables[table].some(row => row.prova_id === insert.prova_id && row.submissao_id === insert.submissao_id && row.numero === insert.numero));
            if (conflict) error = { code: '23505' };
            else { tables[table].push(...inserts); rows = inserts; }
          }
          return Promise.resolve({ data: single ? rows[0] ?? null : structuredClone(rows), error }).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    };
    return query;
  } };
}
const mocks = {
  '@/lib/auth/server': { professorRoute: handler => handler, account: async () => ({ id: teacherUUID, nome: 'Professor sintético', papel: 'professor' }) },
  zod: { z }, '@/lib/ai/schemas': { FeedbackAluno: feedbackSchema }, '@/lib/review': helpers,
  '@/lib/db/server': { db },
  '@/lib/db/api': { apiError: (error, status) => Response.json({ error }, { status }), findProva: async () => tables.provas[0], privateHeaders: {}, serverError: error => { throw error; }, uuid: z.string().uuid() },
  '@/lib/db/submissions': { findSubmission: async (exam, id) => tables.submissoes.find(row => row.prova_id === exam && row.id === id) ?? null },
  '@/lib/ai/client': { ia: () => ({ withOptions: () => ({}) }), MODELO: 'mock' },
  '@/lib/ai/erros': { logFalhaIA() {}, motivoFalhaIA: () => 'falha' },
  '@/lib/review-revision': revisionHelpers,
  '@/lib/ai/feedback': { gerarFeedback: async input => { generatedFeedbackInput = input; return generatedFeedbackInvalid ? { resumo: 'Incompleta', questoes: [], proximosPassos: [] } : ({ resumo: 'Devolutiva de teste', questoes: [1, 2].map(numero => ({ numero, acertos: 'Bom trabalho', erro: '', porque: '', dica: 'Continue praticando', exercicios: [] })), proximosPassos: ['Revise os conceitos'] }); } },
};
async function route(path) {
  const context = vm.createContext({ Response, console });
  const sourceModule = new vm.SourceTextModule(compile(path), { context });
  await sourceModule.link(specifier => {
    assert.ok(mocks[specifier], `Mock ausente: ${specifier}`);
    const exports = mocks[specifier];
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  });
  await sourceModule.evaluate(); return sourceModule.namespace;
}
const root = 'src/app/api/exams/[examId]';
const release = (await route(`${root}/release/route.ts`)).POST;
const save = (await route(`${root}/answers/[answerId]/route.ts`)).PATCH;
const associate = (await route(`${root}/answers/[answerId]/associate/route.ts`)).POST;
const addAnswer = (await route(`${root}/submissions/[submissionId]/answers/route.ts`)).POST;
const reading = (await route(`${root}/answers/[answerId]/reading/route.ts`)).POST;
const feedback = (await route(`${root}/submissions/[submissionId]/feedback/route.ts`)).POST;
const feedbackHandlers = await route(`${root}/submissions/[submissionId]/feedback/route.ts`);
const getFeedback = feedbackHandlers.GET;
const putFeedback = feedbackHandlers.PUT;
const group = (await route(`${root}/groups/[groupId]/route.ts`)).PATCH;
const context = { params: Promise.resolve({ examId, answerId, submissionId }) };
const patch = body => new Request('http://localhost', { method: 'PATCH', body: JSON.stringify(body) });
const putJson = body => new Request('http://localhost', { method: 'PUT', body: JSON.stringify(body) });
const post = () => new Request('http://localhost', { method: 'POST' });
const postJson = body => new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });
for (const corrupt of [() => { tables.respostas = []; }, () => tables.respostas.pop(), () => tables.respostas.push({ ...tables.respostas[0] }), () => { tables.respostas[0].nota_final = 9; }, () => { tables.respostas[0].comentario_final = ''; }, () => { tables.submissoes[0].aluno_id = null; }, () => { tables.submissoes[0].status = 'erro'; }]) {
  reset(); corrupt();
  assert.equal((await release(null, context)).status, 409);
  assert.equal(tables.feedbacks[0].publicado, false);
  assert.equal((await feedback(null, context)).status, 409);
}
reset();
assert.equal((await save(patch({ nota: 1.5, comentario: 'Feedback individual' }), context)).status, 200);
assert.equal(tables.respostas[0].nota_final, 1.5);
assert.equal(tables.respostas[1].nota_final, 1, 'não altera outra resposta');
assert.equal(tables.feedbacks.length, 0, 'invalida devolutiva anterior');
assert.equal((await release(null, context)).status, 409, 'não publica feedback desatualizado');
assert.equal((await feedback(post(), context)).status, 200);
assert.ok(tables.feedbacks[0].conteudo.__revisao, 'guarda a revisão das notas, barema, análise e arquivos');
assert.equal(tables.feedbacks[0].conteudo.__aprovadoEm, undefined, 'geração não aprova o próprio texto');
assert.equal((await release(null, context)).status, 409, 'bloqueia até a aprovação humana do texto');
const generated = await (await getFeedback(null, context)).json();
assert.equal(generated.feedback.revisado, false);
assert.match(generated.feedback.revisao, /^[a-f0-9]{64}$/);
assert.equal((await putFeedback(putJson({ conteudo: { ...generated.feedback.conteudo, questoes: [] }, revisao: generated.feedback.revisao }), context)).status, 400, 'rejeita aprovação com questões faltantes');
assert.equal((await putFeedback(putJson({ conteudo: generated.feedback.conteudo, revisao: generated.feedback.revisao }), context)).status, 200);
assert.equal((await (await getFeedback(null, context)).json()).feedback.revisado, true);
assert.equal((await release(null, context)).status, 200);
assert.equal((await release(null, context)).status, 200, 'liberação repetida é idempotente');
assert.equal(tables.feedbacks[0].publicado, true);
assert.equal((await save(patch({ nota: 1, comentario: 'Mudança' }), context)).status, 409, 'revisão após divulgação continua bloqueada até existir versionamento');
reset();
generatedFeedbackInvalid = true;
assert.equal((await feedback(post(), context)).status, 502, 'rejeita conteúdo gerado sem todas as questões');
assert.equal(tables.feedbacks.length, 1, 'não persiste feedback inválido');
generatedFeedbackInvalid = false;
reset();
assert.equal((await feedback(post(), context)).status, 200);
const firstRead = await (await getFeedback(null, context)).json();
tables.feedbacks[0].conteudo = { ...tables.feedbacks[0].conteudo, resumo: 'Alterada em outra edição' };
assert.equal((await putFeedback(putJson({ conteudo: firstRead.feedback.conteudo, revisao: firstRead.feedback.revisao }), context)).status, 409, 'rejeita aprovação enviada com versão de conteúdo antiga');
for (const mutate of [
  () => { tables.respostas[0].nota_final = 1.5; },
  () => { tables.submissoes[0].arquivo_paths = ['file-2']; },
  () => { tables.provas[0].barema.questoes[0].valorTotal = 3; },
]) {
  reset();
  tables.feedbacks[0].conteudo = approvedContent(tables.submissoes[0], tables.respostas);
  mutate();
  assert.equal((await release(null, context)).status, 409, 'bloqueia liberação quando notas, arquivo ou barema divergem do snapshot');
}
reset(); tables.respostas[0].correcao.legivel = false;
assert.equal((await save(patch({ nota: 0, comentario: 'Revisado' }), context)).status, 409);
assert.equal((await save(patch({ nota: 0, comentario: 'Revisado', leituraConferida: true }), context)).status, 200);
assert.equal(tables.respostas[0].correcao.legivel, true, 'confirma leitura após conferência humana');
assert.equal(tables.respostas[0].correcao.legibilidadeOriginal, false, 'preserva que a leitura original era incerta');
assert.ok(tables.respostas[0].correcao.leituraConferidaEm, 'registra quando o professor conferiu');
reset();
assert.equal((await save(patch({ nota: 3, comentario: 'Excede teto' }), context)).status, 400);
assert.equal((await save(patch({ nota: -0.1, comentario: 'Nota negativa' }), context)).status, 400);
assert.equal((await save(patch({ nota: '1', comentario: 'Nota como texto' }), context)).status, 400);
assert.equal((await save(patch({ nota: 1, comentario: ' ' }), context)).status, 400);
assert.equal((await save(new Request('http://localhost', { method: 'PATCH', body: '{' }), context)).status, 400, 'JSON inválido retorna erro de entrada');
assert.equal((await group(null, context)).status, 409);
assert.equal(tables.respostas[0].nota_final, 1);
reset();
const secondSubmission = '10000000-0000-4000-8000-000000000004';
tables.submissoes.push({ id: secondSubmission, prova_id: examId, aluno_id: 'student-2', status: 'corrigida' });
tables.respostas.push(...[1, 2].map(numero => ({ id: `second-${numero}`, prova_id: examId, submissao_id: secondSubmission, numero, nota_final: 1, comentario_final: 'Comentário revisado', correcao: { legivel: true } })));
tables.feedbacks = [];
assert.equal((await release(null, context)).status, 409, 'não libera enquanto falta devolutiva para uma submissão');
tables.feedbacks.push({ submissao_id: submissionId, token: 'abc', publicado: false, conteudo: approvedContent(tables.submissoes[0], tables.respostas) });
assert.equal((await release(null, context)).status, 409, 'não libera com aprovação faltante do segundo aluno');
assert.ok(tables.feedbacks.every(row => !row.publicado), 'não publica devolutivas parcialmente');
tables.feedbacks.push({ submissao_id: secondSubmission, token: 'def', publicado: false, conteudo: approvedContent(tables.submissoes[1], tables.respostas) });
assert.equal((await release(null, context)).status, 200, 'libera quando cada submissão está completa e tem devolutiva');
assert.ok(tables.feedbacks.every(row => row.publicado));
reset();
const pendingId = '10000000-0000-4000-8000-000000000005';
const originalPendingCorrection = { numero: 0, transcricao: 'rascunho original', legivel: false, notaSugerida: 1.5, criterioIds: ['c1'] };
tables.respostas = [tables.respostas[0], { id: pendingId, prova_id: examId, submissao_id: submissionId, numero: -1, nota_final: 0.5, comentario_final: 'nota antiga', grupo_id: null, correcao: structuredClone(originalPendingCorrection) }];
const associationContext = { params: Promise.resolve({ examId, answerId: pendingId, submissionId }) };
assert.equal((await associate(postJson({ numero: 1 }), associationContext)).status, 409, 'não substitui uma resposta já associada à questão');
assert.equal(tables.respostas.find(row => row.id === answerId).nota_final, 1);
assert.equal((await associate(postJson({ numero: 2 }), associationContext)).status, 200, 'associa resposta negativa a questão em falta');
const associated = tables.respostas.find(row => row.id === pendingId);
assert.equal(associated.numero, 2);
assert.equal(associated.nota_final, null);
assert.equal(associated.comentario_final, null);
assert.equal(associated.correcao.transcricao, originalPendingCorrection.transcricao);
assert.equal(associated.correcao.numero, 2);
assert.equal(associated.correcao.associacaoOriginal, 0);
assert.equal((await release(null, context)).status, 409, 'associação ainda exige revisar notas e feedback');
reset();
tables.respostas = [tables.respostas[0], { id: pendingId, prova_id: examId, submissao_id: submissionId, numero: -1, nota_final: null, comentario_final: null, correcao: structuredClone(originalPendingCorrection) }];
raceAssociation = true;
assert.equal((await associate(postJson({ numero: 2 }), associationContext)).status, 409, 'recarrega quando a associação foi alterada durante a gravação');
assert.equal(tables.respostas.find(row => row.id === pendingId).numero, -99, 'não grava sobre o estado concorrente');
reset();
tables.provas[0].status = 'corrigida';
tables.respostas.push({ id: pendingId, prova_id: examId, submissao_id: submissionId, numero: -1, nota_final: null, comentario_final: null, correcao: originalPendingCorrection });
assert.equal((await associate(postJson({ numero: 2 }), associationContext)).status, 409, 'não altera resposta depois da publicação');

reset();
const addContext = { params: Promise.resolve({ examId, submissionId }) };
tables.respostas = [tables.respostas[0]];
assert.equal((await addAnswer(postJson({ numero: 2, transcricao: 'Resposta manuscrita' }), addContext)).status, 400, 'exige confirmação do arquivo');
assert.equal((await addAnswer(postJson({ numero: 2, transcricao: '   ', arquivoConferido: true }), addContext)).status, 400, 'exige transcrição não vazia');
assert.equal((await addAnswer(postJson({ numero: 1, transcricao: 'Duplicada', arquivoConferido: true }), addContext)).status, 409, 'recusa nota já existente');
assert.equal((await addAnswer(postJson({ numero: 2, transcricao: 'Resposta manuscrita', arquivoConferido: true }), addContext)).status, 201);
const manual = tables.respostas.find(row => row.numero === 2);
assert.equal(manual.nota_final, null);
assert.equal(manual.comentario_final, null);
assert.equal(manual.correcao.origem, 'professor');
assert.equal(manual.correcao.transcricao, 'Resposta manuscrita');
assert.equal(manual.correcao.legivel, true);
assert.equal(tables.submissoes[0].status, 'corrigida', 'marca como corrigida quando todas as questões têm resposta');
assert.equal(tables.feedbacks.length, 0, 'resposta manual invalida feedback anterior');
tables.submissoes.push({ id: '10000000-0000-4000-8000-000000000006', prova_id: '10000000-0000-4000-8000-000000000007', aluno_id: 'another-exam-student', status: 'corrigida' });
assert.equal((await addAnswer(postJson({ numero: 2, transcricao: 'Resposta', arquivoConferido: true }), { params: Promise.resolve({ examId, submissionId: '10000000-0000-4000-8000-000000000006' }) })).status, 404, 'não aceita submissão pertencente a outra prova');

reset();
tables.respostas = [tables.respostas[0]];
assert.equal((await addAnswer(postJson({ numero: 2, transcricao: '', situacao: 'em_branco', arquivoConferido: true }), addContext)).status, 201, 'permite registrar questão conferida e em branco');
const blank = tables.respostas.find(row => row.numero === 2);
assert.equal(blank.nota_final, null, 'questão em branco continua sem nota automática');
assert.equal(blank.correcao.tipoErro, 'em_branco');
assert.match(blank.correcao.transcricao, /visivelmente em branco/);
reset();
tables.respostas = [tables.respostas[0]];
assert.equal((await addAnswer(postJson({ numero: 2, transcricao: '', arquivoConferido: true }), addContext)).status, 400, 'transcrição ausente não equivale a branco');
assert.equal((await addAnswer(postJson({ numero: 2, transcricao: 'Resposta', situacao: 'ausente', arquivoConferido: true }), addContext)).status, 400, 'não aceita situação ausente como resposta manual');
assert.equal((await addAnswer(postJson({ numero: 2, transcricao: 'ilegível', situacao: 'ilegivel', arquivoConferido: true }), addContext)).status, 400, 'não aceita estado ilegível como resposta manual');

reset();
tables.respostas = [tables.respostas[0], { id: 'resolved-manual-blocker', prova_id: examId, submissao_id: submissionId, numero: -1,
  nota_final: null, comentario_final: null, grupo_id: null, correcao: { ...originalPendingCorrection,
  resolucaoLeitura: { acao: 'desconsiderar', tipo: 'fora_da_prova', motivo: 'Página de rascunho', professorId: teacherUUID,
    em: '2026-11-10T10:00:00.000Z', revisaoAnterior: 'b'.repeat(64) } } }];
assert.equal((await addAnswer(postJson({ numero: 2, transcricao: 'Resposta conferida', arquivoConferido: true }), addContext)).status, 201, 'linha negativa já resolvida não bloqueia resposta manual');

const readingPendingId = '10000000-0000-4000-8000-000000000005';
const pendingContext = { params: Promise.resolve({ examId, answerId: readingPendingId }) };
const pendingCorrection = { numero: 0, transcricao: 'leitura duplicada preservada', legivel: false, notaSugerida: 0, criteriosAtendidos: [] };
const makePending = () => ({ id: readingPendingId, prova_id: examId, submissao_id: submissionId, numero: -1, nota_final: null, comentario_final: null, grupo_id: null, correcao: structuredClone(pendingCorrection) });
const readDecision = (acao, revisao, extra = {}) => postJson({ acao, revisao, ...extra });
const duplicateDecision = (revisao, extra = {}) => readDecision('desconsiderar', revisao, { tipo: 'duplicada', motivo: 'Página repetida no envio', arquivoConferido: true, duplicadaDe: answerId, ...extra });
reset();
const pending = makePending();
tables.respostas.push(pending);
tables.feedbacks = [{ submissao_id: submissionId, token: 'abc', publicado: false }];
assert.ok(helpers.reviewIssues(tables.provas[0].barema, tables.submissoes, tables.respostas).length, 'pendência negativa ainda bloqueia revisão antes de decisão');
const pendingRevision = revisionHelpers.readingRevision(pending);
assert.equal((await reading(duplicateDecision(pendingRevision, { arquivoConferido: undefined }), pendingContext)).status, 400, 'exige confirmação explícita do arquivo');
assert.equal((await reading(duplicateDecision(pendingRevision, { motivo: 'ruim' }), pendingContext)).status, 400, 'exige motivo mínimo');
const otherSubmission = '10000000-0000-4000-8000-000000000006';
tables.submissoes.push({ id: otherSubmission, prova_id: examId, aluno_id: 'student-2', status: 'corrigida' });
tables.respostas.push({ id: 'other-target', prova_id: examId, submissao_id: otherSubmission, numero: 1, nota_final: 1, comentario_final: 'Outra pessoa', correcao: { legivel: true } });
assert.equal((await reading(duplicateDecision(pendingRevision, { duplicadaDe: 'other-target' }), pendingContext)).status, 400, 'duplicadaDe precisa ser resposta da mesma submissão');
assert.equal((await reading(duplicateDecision(revisionHelpers.readingRevision(tables.respostas[0])), { params: Promise.resolve({ examId, answerId }) })).status, 409, 'não resolve linha positiva associada');
tables.provas[0].status = 'corrigida';
assert.equal((await reading(duplicateDecision(pendingRevision), pendingContext)).status, 409, 'não resolve depois da publicação');
tables.provas[0].status = 'corrigindo';
tables.respostas = tables.respostas.filter(row => row.id !== 'other-target');
tables.submissoes = tables.submissoes.filter(row => row.id !== otherSubmission);
const resolvedResponse = await reading(duplicateDecision(pendingRevision), pendingContext);
assert.equal(resolvedResponse.status, 200, 'desconsidera leitura duplicada sem apagar a linha');
const resolved = tables.respostas.find(row => row.id === readingPendingId);
assert.equal(resolved.numero, -1);
assert.equal(resolved.nota_final, null);
assert.equal(resolved.comentario_final, null);
assert.equal(resolved.correcao.transcricao, pendingCorrection.transcricao);
assert.equal(resolved.correcao.resolucaoLeitura.professorId, teacherUUID);
assert.ok(resolved.correcao.resolucaoLeitura.em);
assert.equal(resolved.correcao.historicoLeitura.length, 1);
assert.equal(tables.respostas.find(row => row.id === answerId).nota_final, 1, 'preserva a nota da resposta canônica');
assert.equal(tables.respostas.find(row => row.id === 'second-answer').nota_final, 1, 'preserva as outras notas');
assert.equal(tables.feedbacks.length, 0, 'invalida devolutiva que ficou desatualizada');
assert.equal(helpers.isResolvedReading(resolved), true);
assert.deepEqual(helpers.reviewIssues(tables.provas[0].barema, tables.submissoes, tables.respostas), [], 'ignora somente a leitura negativa resolvida');
assert.equal((await reading(duplicateDecision(pendingRevision), pendingContext)).status, 200, 'repetição do mesmo pedido é idempotente');
assert.equal(resolved.correcao.historicoLeitura.length, 1, 'repetição não duplica histórico');
tables.feedbacks = [{ submissao_id: submissionId, token: 'novo-texto', publicado: false }];
assert.equal((await reading(duplicateDecision(pendingRevision), pendingContext)).status, 200);
assert.equal(tables.feedbacks.length, 1, 'retentativa não apaga texto preparado depois da decisão');
const resolveSnapshot = revisionHelpers.readingRevision(resolved);
resolved.correcao.transcricao = 'alterada em outra revisão';
assert.equal((await reading(readDecision('reabrir', resolveSnapshot), pendingContext)).status, 409, 'rejeita snapshot antigo');
const currentSnapshot = revisionHelpers.readingRevision(resolved);
assert.equal((await reading(readDecision('reabrir', currentSnapshot), pendingContext)).status, 200, 'reabre usando snapshot atual');
assert.equal(helpers.isResolvedReading(resolved), false, 'reversão volta a leitura para pendência');
assert.equal(resolved.correcao.historicoLeitura.length, 2, 'registra decisão e reversão no histórico');
assert.ok(helpers.reviewIssues(tables.provas[0].barema, tables.submissoes, tables.respostas).length, 'linha reaberta volta a bloquear revisão');
assert.equal((await reading(readDecision('reabrir', currentSnapshot), pendingContext)).status, 200, 'repetição da reversão é idempotente');
assert.equal(resolved.correcao.historicoLeitura.length, 2);

reset();
const resolvedForFeedback = makePending();
resolvedForFeedback.correcao.resolucaoLeitura = { acao: 'desconsiderar', tipo: 'duplicada', motivo: 'Página repetida no envio', professorId: teacherUUID,
  em: '2026-11-10T10:00:00.000Z', revisaoAnterior: 'a'.repeat(64), duplicadaDe: answerId };
tables.respostas.push(resolvedForFeedback);
generatedFeedbackInput = undefined;
assert.deepEqual(helpers.reviewIssues(tables.provas[0].barema, tables.submissoes, tables.respostas), []);
assert.equal((await feedback(post(), context)).status, 200, 'gera devolutiva quando só há linha técnica já resolvida além das notas');
assert.deepEqual(generatedFeedbackInput.questoes.map(question => question.numero), [1, 2], 'não envia linha negativa resolvida para geração de texto');
assert.equal(tables.feedbacks[0].conteudo.__revisao, revisionHelpers.reviewRevision(tables.provas[0], tables.submissoes[0], tables.respostas), 'snapshot mantém todas as linhas e a metadata de resolução');
console.log('OK: handlers de revisão, feedback e liberação; completude, nota individual, leitura manual, invalidação e rejeição de aprovação automática por grupo.');
