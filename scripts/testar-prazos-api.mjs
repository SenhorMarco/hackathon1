// Exercita os handlers reais de prazos com uma implementação de banco em memória.
// Execute: node --experimental-vm-modules scripts/testar-prazos-api.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';

const examId = '10000000-0000-4000-8000-000000000001';
const alunoA = '10000000-0000-4000-8000-000000000002';
const alunoB = '10000000-0000-4000-8000-000000000003';
const alunoOutro = '10000000-0000-4000-8000-000000000004';
const originalDeadline = '2026-10-01T12:00:00.000Z';
let prova;
let alunos;
let race;

function reset(overrides = {}) {
  prova = { id: examId, turma_id: 'class-1', status: 'corrigindo', prazo_envio: originalDeadline,
    excecoes_envio: {}, ...overrides };
  alunos = [{ id: alunoA, nome: 'Ana' }, { id: alunoB, nome: 'Bia' }];
  race = false;
}
function db() {
  return { from(table) {
    const filters = [];
    let values;
    const query = {
      select() { return query; },
      eq(key, value) { filters.push(row => key === 'excecoes_envio' && typeof value === 'string'
        ? JSON.stringify(row[key]) === value : row[key] === value); return query; },
      is(key, value) { filters.push(row => row[key] === value); return query; },
      order() { return query; },
      update(data) { values = data; return query; },
      maybeSingle() {
        if (race) { prova.prazo_envio = '2026-10-02T12:00:00.000Z'; race = false; }
        if (table !== 'provas' || !filters.every(filter => filter(prova))) return Promise.resolve({ data: null, error: null });
        Object.assign(prova, values);
        return Promise.resolve({ data: structuredClone(prova), error: null });
      },
      then(resolve, reject) {
        try {
          const data = table === 'alunos' ? alunos.filter(row => filters.every(filter => filter({ ...row, turma_id: 'class-1' }))) : [];
          return Promise.resolve({ data: structuredClone(data), error: null }).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    };
    return query;
  } };
}
const mocks = {
  '@/lib/auth/server': { professorRoute: handler => handler },
  '@/lib/db/api': {
    apiError: (error, status) => Response.json({ error }, { status }),
    findProva: async id => id === examId ? prova : null,
    privateHeaders: { 'cache-control': 'private, no-store' },
    serverError: error => { throw error; },
    uuid: z.string().uuid(),
  },
  '@/lib/db/server': { db },
};
const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = vm.createContext({ Response, console });
const routeModule = new vm.SourceTextModule(compile('src/app/api/exams/[examId]/deadlines/route.ts'), { context });
await routeModule.link(specifier => {
  if (specifier === 'node:crypto') return new vm.SyntheticModule(['createHash'], function () { this.setExport('createHash', createHash); }, { context });
  if (specifier === 'zod') return new vm.SyntheticModule(['z'], function () { this.setExport('z', z); }, { context });
  assert.ok(mocks[specifier], `Mock ausente: ${specifier}`);
  const exports = mocks[specifier];
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
});
await routeModule.evaluate();
const { GET, PUT } = routeModule.namespace;
const routeContext = { params: Promise.resolve({ examId }) };
const get = () => GET(new Request('http://localhost'), routeContext);
const put = body => PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify(body) }), routeContext);
const read = async () => {
  const response = await get();
  assert.equal(response.status, 200);
  return response.json();
};
const save = async (state, prazo, excecoes = state.excecoes) => put({ prazo, excecoes, revisao: state.revisao });

reset();
let state = await read();
assert.deepEqual(state.alunos.map(a => a.id), [alunoA, alunoB], 'GET lista somente alunos da turma da prova');
assert.equal(state.prazo, originalDeadline);
let response = await save(state, '2020-01-01T00:00:00.000Z');
assert.equal(response.status, 200, 'prazo geral passado pode ser configurado');
assert.equal(prova.prazo_envio, '2020-01-01T00:00:00.000Z');

reset(); state = await read();
assert.equal((await save(state, state.prazo, { [alunoOutro]: '2026-12-01T00:00:00.000Z' })).status, 400,
  'não aceita exceção para aluno fora da turma');
assert.equal(prova.excecoes_envio[alunoOutro], undefined, 'rejeição não persiste alteração');
assert.equal((await save(state, state.prazo, { [alunoA]: '2026-01-01T00:00:00.000Z' })).status, 400,
  'exceção nova já expirada é rejeitada');
response = await save(state, state.prazo, { [alunoA]: '2026-12-01T00:00:00.000Z' });
assert.equal(response.status, 200, 'exceção nova futura que estende o prazo é aceita');
assert.equal(prova.excecoes_envio[alunoA], '2026-12-01T00:00:00.000Z');
state = await read();
assert.equal((await save(state, state.prazo, {})).status, 200, 'permite revogar exceções');
assert.deepEqual(prova.excecoes_envio, {});

reset(); state = await read();
assert.equal((await save(state, '2026-12-01T00:00:00.000Z')).status, 200);
assert.equal((await save(state, state.prazo)).status, 409, 'revisão antiga é rejeitada');
reset({ status: 'corrigida' }); state = await read();
assert.equal((await save(state, state.prazo)).status, 409, 'prova publicada não aceita mudanças');
reset({ excecoes_envio: undefined });
assert.equal((await get()).status, 503, 'GET informa migração ausente');
state = { prazo: originalDeadline, excecoes: {}, revisao: 'a'.repeat(64) };
assert.equal((await save(state, originalDeadline)).status, 503, 'PUT informa migração ausente');
reset(); state = await read();
assert.equal((await save(state, 'data-inválida')).status, 400, 'data sem formato ISO/fuso é rejeitada');
reset(); state = await read(); race = true;
assert.equal((await save(state, '2026-12-01T00:00:00.000Z')).status, 409, 'concorrência durante gravação exige recarregar');
assert.equal(prova.prazo_envio, '2026-10-02T12:00:00.000Z', 'não grava por cima da alteração concorrente');

console.log('OK: GET/PUT de prazos, escopo da turma, revisão concorrente, migração e validação de exceções.');
