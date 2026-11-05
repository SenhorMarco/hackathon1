// Regras de prazo e exceção individual, exercitando a implementação real.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('src/lib/deadlines.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { acceptsSubmission, effectiveDeadline, STATUS_RECEBE_ENVIO } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);
const open = { status: 'corrigindo', prazo_envio: '2026-11-05T12:00:00.000Z' };
const atDeadline = Date.parse(open.prazo_envio);

assert.equal(acceptsSubmission(open, 'aluno-a', atDeadline - 1), true, 'aceita até um milissegundo antes do fim');
assert.equal(acceptsSubmission(open, 'aluno-a', atDeadline), false, 'fecha exatamente no instante final');
assert.equal(acceptsSubmission(open, 'aluno-a', atDeadline + 1), false, 'continua fechada após o fim');
assert.equal(acceptsSubmission({ ...open, prazo_envio: '2026-11-05T11:59:59.999Z' }, 'aluno-a', atDeadline), false, 'prazo passado');
assert.equal(effectiveDeadline({ ...open, prazo_envio: null }, 'aluno-a'), null);
assert.equal(acceptsSubmission({ ...open, prazo_envio: null }, 'aluno-a', atDeadline), true, 'sem prazo global permanece aberto nos status que recebem envios');

const offsetA = { ...open, prazo_envio: '2026-11-05T12:00:00+00:00' };
const offsetB = { ...open, prazo_envio: '2026-11-05T09:00:00-03:00' };
assert.equal(Date.parse(offsetA.prazo_envio), Date.parse(offsetB.prazo_envio));
assert.equal(acceptsSubmission(offsetA, 'aluno-a', atDeadline), acceptsSubmission(offsetB, 'aluno-a', atDeadline), 'offsets distintos para o mesmo instante têm resultado igual');

const exception = { ...open, excecoes_envio: { 'aluno-a': '2026-11-05T14:00:00.000Z' } };
assert.equal(effectiveDeadline(exception, 'aluno-a'), exception.excecoes_envio['aluno-a']);
assert.equal(acceptsSubmission(exception, 'aluno-a', Date.parse('2026-11-05T13:59:59.999Z')), true, 'exceção autoriza somente o aluno indicado');
assert.equal(acceptsSubmission(exception, 'aluno-b', atDeadline), false, 'outro aluno continua sob o prazo global');
assert.equal(acceptsSubmission(exception, 'aluno-a', Date.parse('2026-11-05T14:00:00.000Z')), false, 'exceção também fecha no instante final');
assert.equal(effectiveDeadline({ ...open, excecoes_envio: { 'aluno-a': '2026-11-05T11:00:00.000Z' } }, 'aluno-a'), open.prazo_envio,
  'exceção mais curta não reduz o prazo global');
assert.equal(acceptsSubmission({ ...exception, excecoes_envio: { 'aluno-a': '2026-11-05T11:00:00.000Z' } }, 'aluno-a', atDeadline), false);
assert.equal(acceptsSubmission({ ...exception, excecoes_envio: { 'aluno-a': '2026-11-05T11:00:00.000Z' } }, 'aluno-a', atDeadline - 1), true,
  'exceção expirada ou menor é ignorada e o aluno mantém o prazo geral');

for (const status of STATUS_RECEBE_ENVIO) assert.equal(acceptsSubmission({ ...open, status }, 'aluno-a', atDeadline - 1), true);
assert.equal(acceptsSubmission({ ...open, status: 'corrigida' }, 'aluno-a', atDeadline - 1), false, 'publicação encerra envio mesmo antes do prazo');
assert.equal(acceptsSubmission({ ...open, prazo_envio: 'data-inválida' }, 'aluno-a', 0), false, 'prazo configurado inválido falha fechado');
assert.equal(acceptsSubmission({ ...open, excecoes_envio: { 'aluno-a': 'data-inválida' } }, 'aluno-a', atDeadline), false,
  'exceção inválida não prorroga o prazo geral');

console.log('OK: limite inclusivo, passado, prazo ausente, fusos, exceção por aluno, status publicado e datas inválidas.');
