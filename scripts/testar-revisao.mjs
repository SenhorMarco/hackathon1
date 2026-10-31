// Regras de liberação e notas: não acessa serviços externos.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync('src/lib/review.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { reviewIssues, finalTotal, isValidated, csvCell } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const rubric = { questoes: [{ numero: 1, valorTotal: 2 }, { numero: 3, valorTotal: 4 }] };
const submission = { id: 's1', aluno_id: 'a1', status: 'corrigida' };
const answer = (numero, nota_final) => ({ submissao_id: 's1', numero, nota_final, comentario_final: 'Feedback revisado.' });
const complete = [answer(1, 1.5), answer(3, 3)];
assert.deepEqual(reviewIssues(rubric, [submission], complete), []);
assert.equal(finalTotal(rubric, submission, complete), 4.5);
for (const rows of [[], complete.slice(0, 1), [...complete, answer(3, 1)], [answer(1, null), answer(3, 3)], [answer(1, 3), answer(3, 3)], [answer(1, -1), answer(3, 3)], [answer(1, NaN), answer(3, 3)], [...complete, answer(9, 0)], [answer(1, 0), { ...answer(3, 3), comentario_final: '  ' }]]) {
  assert.ok(reviewIssues(rubric, [submission], rows).length);
  assert.equal(finalTotal(rubric, submission, rows), null);
}
assert.ok(reviewIssues(rubric, [], []).length);
assert.ok(reviewIssues(null, [submission], complete).length);
assert.ok(reviewIssues({ questoes: [] }, [submission], complete).length);
assert.ok(reviewIssues(rubric, [{ ...submission, aluno_id: null }], complete).length);
assert.ok(reviewIssues(rubric, [{ ...submission, status: 'erro' }], complete).length);
assert.ok(reviewIssues(rubric, [submission, { ...submission, id: 's2', aluno_id: 'a2' }], complete).length);
assert.equal(isValidated(answer(1, 0), 2), true, 'zero explícito revisado é uma nota válida');
assert.equal(isValidated(answer(1, null), 2), false, 'ausência de nota não equivale a zero');
assert.equal(csvCell('=SUM(A1)'), '"\'=SUM(A1)"');
assert.equal(csvCell('João "Silva"'), '"João ""Silva"""');
console.log('OK: completude por aluno/questão, ausência, duplicação, teto, feedback, soma e CSV.');
