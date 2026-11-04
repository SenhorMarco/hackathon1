// Conversão da revisão persistida para respostas do dashboard, sem serviços externos.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

async function loadTs(path, replacements = []) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const replaced = replacements.reduce((text, [from, to]) => text.replace(from, to), source);
  return import(`data:text/javascript;base64,${Buffer.from(replaced).toString('base64')}`);
}

const review = await loadTs('src/lib/review.ts');
const reviewImports = `const isValidated = ${review.isValidated.toString()};\nconst reviewIssues = ${review.reviewIssues.toString()};`;
const { responsesFromReview, examFromProva } = await loadTs('src/lib/exams.ts', [
  ["import { reviewIssues } from './review';", reviewImports],
]);
const { validatedMean } = await loadTs('src/lib/data.ts');
const analysis = { questoes: [1, 3].map(numero => ({
  numero, conteudo: `Conteúdo ${numero}`, enunciado: `Questão ${numero}`,
  resolucao: { respostaFinal: `Resposta ${numero}` }, dificuldadeEstimada: 'media',
})) };
const fullRubric = { questoes: [
  { numero: 1, valorTotal: 2, criterios: [{ id: 'c1', descricao: 'Q1', pontos: 2 }] },
  { numero: 3, valorTotal: 4, criterios: [{ id: 'c3', descricao: 'Q3', pontos: 4 }] },
] };
const prova = {
  id: 'p1', titulo: 'Prova', data_avaliacao: null, created_at: '2026-11-01T10:00:00Z',
  arquivo_nome: 'prova.pdf', status: 'corrigida', revisao: 'r1', analise: analysis,
  barema: fullRubric,
};
const students = [{ id: 'db-a1', referencia_local: 'turma-a1', nome: 'Ana' }];
const submission = { id: 's1', aluno_id: 'db-a1', status: 'corrigida', arquivo_nomes: ['ana.pdf'] };
const answer = (numero, nota_final, comentario_final = 'Resposta revisada.') => ({
  submissao_id: 's1', numero, nota_final, comentario_final,
});
const complete = [answer(1, 2), answer(3, 4)];

const responses = responsesFromReview(prova, [submission], complete, students);
assert.equal(responses['turma-a1:q1'].score, 2);
assert.equal(responses['turma-a1:q3'].score, 4, 'usa o número real da questão, não sua posição no array');
assert.equal(responses['turma-a1:q1'].feedback, 'Resposta revisada.');
assert.deepEqual(Object.keys(responses).sort(), ['turma-a1:q1', 'turma-a1:q3']);

const zeroAnswers = [answer(1, 0), answer(3, 0)];
assert.equal(responsesFromReview(prova, [submission], zeroAnswers, students)['turma-a1:q1'].score, 0,
  'nota zero revisada é diferente de resposta ausente');

const invalidSets = [
  [],
  [answer(1, 2)],
  [answer(1, 2), answer(3, 4), answer(3, 1)],
  [answer(1, null), answer(3, 4)],
  [answer(1, 2, '   '), answer(3, 4)],
  [answer(1, -0.1), answer(3, 4)],
  [answer(1, 2.1), answer(3, 4)],
  [answer(1, 2), answer(3, 4), { ...answer(9, 0) }],
];
for (const answers of invalidSets) {
  assert.deepEqual(responsesFromReview(prova, [submission], answers, students), {},
    'resposta incompleta ou inválida não deve gerar nota no dashboard');
}

const duplicateSubmissions = [submission, { ...submission, id: 's2', arquivo_nomes: ['ana2.pdf'] }];
assert.deepEqual(responsesFromReview(prova, duplicateSubmissions, complete, students), {},
  'submissões duplicadas para o mesmo aluno devem ser excluídas');
assert.deepEqual(responsesFromReview(prova, [{ ...submission, status: 'erro' }], complete, students), {},
  'submissão ainda não corrigida deve ser excluída');

const noLocalReference = [{ ...students[0], referencia_local: null }];
const fallback = responsesFromReview(prova, [submission], complete, noLocalReference);
assert.ok(fallback['db-a1:q3'], 'usa o id do aluno quando não há referência local');

const dashboardExam = examFromProva({ ...prova, respostasValidadas: responses });
assert.deepEqual(dashboardExam.responses, responses);
assert.equal(dashboardExam.released, true);
assert.deepEqual(dashboardExam.questions.map(q => q.id), ['q1', 'q3']);
assert.deepEqual(dashboardExam.questions.map(q => q.criteria[0].points), [2, 4]);
assert.deepEqual(examFromProva(prova).responses, {}, 'prova sem respostas validadas não ganha notas');

const dashboardStudents = [{ id: 'turma-a1', name: 'Ana', email: 'ana@example.test' }];
assert.deepEqual(validatedMean(dashboardExam, dashboardStudents), { count: 1, mean: 10 });
const zeroExam = examFromProva({ ...prova, respostasValidadas: responsesFromReview(prova, [submission], zeroAnswers, students) });
assert.deepEqual(validatedMean(zeroExam, dashboardStudents), { count: 1, mean: 0 });
assert.deepEqual(validatedMean(examFromProva(prova), dashboardStudents), { count: 0, mean: null });
const partialResponses = responsesFromReview(prova, [submission], [answer(1, 2)], students);
assert.deepEqual(validatedMean(examFromProva({ ...prova, respostasValidadas: partialResponses }), dashboardStudents),
  { count: 0, mean: null }, 'cobertura parcial não entra no divisor da média');
const zeroMaximumProva = { ...prova, barema: { questoes: [
  { numero: 1, valorTotal: 0, criterios: [{ id: 'c1', descricao: 'Q1', pontos: 0 }] },
  { numero: 3, valorTotal: 0, criterios: [{ id: 'c3', descricao: 'Q3', pontos: 0 }] },
] } };
assert.deepEqual(validatedMean(examFromProva({ ...zeroMaximumProva, respostasValidadas: responses }), dashboardStudents),
  { count: 0, mean: null }, 'nota máxima total zero não gera média');
const noQuestionsProva = { ...prova, analise: { questoes: [] }, barema: { questoes: [] } };
assert.deepEqual(validatedMean(examFromProva({ ...noQuestionsProva, respostasValidadas: responses }), dashboardStudents),
  { count: 0, mean: null }, 'prova sem questões não gera média');
console.log('OK: notas reais e zero, questões numeradas, feedback, validação, duplicatas e carregamento da prova.');
