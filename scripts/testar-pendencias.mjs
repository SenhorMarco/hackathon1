// Normalização das linhas da IA sem banco ou serviços externos.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('src/lib/correction-rows.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { correctionRows } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const rubric = { questoes: [{ numero: 1 }, { numero: 2 }, { numero: 4 }] };
const transcriptions = [
  { numero: 2, respostaAluno: 'transcrição válida', legivel: true },
  { numero: 0, respostaAluno: 'sem questão identificada', legivel: false },
  { numero: 99, respostaAluno: 'questão desconhecida', legivel: true },
  { numero: 2, respostaAluno: 'questão duplicada', legivel: true },
  { numero: 1, respostaAluno: 'outra transcrição válida', legivel: true },
];
const rows = correctionRows({ questoes: transcriptions }, rubric, 'exam', 'submission');

assert.deepEqual(rows.map(row => row.numero), [2, -2, -3, -4, 1]);
assert.equal(new Set(rows.map(row => row.numero)).size, rows.length, 'todas as chaves técnicas são únicas');
assert.deepEqual(rows.map(row => row.correcao), transcriptions, 'mantém integralmente texto e metadados da transcrição');
assert.ok(rows.every(row => row.nota_final === null), 'não atribui nota final às respostas pendentes');
assert.ok(rows.every(row => row.comentario_final === null));
assert.equal(rows[0].numero, 2, 'a primeira resposta válida mantém sua associação');
assert.equal(rows[4].numero, 1, 'outra resposta válida mantém sua associação');
assert.equal(rows.filter(row => row.numero === 2).length, 1, 'duplicata não sobrescreve a resposta válida');
assert.ok(rows.every(row => row.prova_id === 'exam' && row.submissao_id === 'submission' && row.grupo_id === null));

console.log('OK: questões válidas preservadas; zero, desconhecidas e duplicadas ficam pendentes com chaves únicas, transcrição intacta e sem nota final.');
