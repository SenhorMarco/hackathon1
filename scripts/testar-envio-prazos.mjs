// Handlers, tickets e portal reais + PostgreSQL local (PGlite).
// Autenticação e Storage simulados; não comprova deploy nem múltiplas conexões.
// node --experimental-vm-modules scripts/testar-envio-prazos.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as nodeCrypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const sql = new PGlite();
const exam = nodeCrypto.randomUUID(), room = nodeCrypto.randomUUID();
const studentA = nodeCrypto.randomUUID(), studentB = nodeCrypto.randomUUID();
const a = { id: nodeCrypto.randomUUID(), nome: 'Aluno A', email: 'a@example.test', papel: 'aluno' };
const b = { id: nodeCrypto.randomUUID(), nome: 'Aluno B', email: 'b@example.test', papel: 'aluno' };
let active = a, onDownload = null;
const objects = new Map();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8mQAAAAASUVORK5CYII=', 'base64');
const storage = {
  async createSignedUploadUrl(path) { return { data: { signedUrl: `https://storage.example.test/${path}` }, error: null }; },
  async download(path) {
    if (onDownload) { const action = onDownload; onDownload = null; await action(); }
    return { data: objects.get(path) || null, error: null };
  },
  async remove(paths) { for (const path of paths) objects.delete(path); return { error: null }; },
};
function db() {
  return {
    storage: { from: () => storage },
    async rpc(name, p) {
      assert.equal(name, 'confirmar_envio_aluno');
      try {
        const result = await sql.query('select confirmar_envio_aluno($1,$2,$3,$4,$5,$6,$7,$8) as envio',
          [p.p_prova,p.p_aluno,p.p_envio,p.p_anteriores,p.p_paths,p.p_nomes,p.p_nome,p.p_remover]);
        return { data: result.rows[0].envio, error: null };
      } catch (error) { return { data: null, error }; }
    },
    from(table) {
      assert.ok(['provas','alunos','submissoes'].includes(table));
      const filters = [], values = [];
      let ordering = '', limit = '', single = false;
      const query = {
        select() { return query; },
        eq(key, value) { assert.match(key, /^[a-z_]+$/); values.push(value); filters.push(`${key}=$${values.length}`); return query; },
        order(key, options) { assert.equal(key, 'created_at'); ordering = ` order by created_at ${options?.ascending === false ? 'desc' : 'asc'}`; return query; },
        limit(n) { assert.equal(n, 1); limit = ' limit 1'; return query; },
        maybeSingle() { single = true; return query; },
        async then(fulfilled, rejected) {
          try {
            const result = await sql.query(`select * from ${table}${filters.length ? ' where ' + filters.join(' and ') : ''}${ordering}${limit}`, values);
            return fulfilled({ data: single ? result.rows[0] || null : result.rows, error: null });
          } catch (error) { return rejected ? rejected(error) : Promise.reject(error); }
        },
      }; return query;
    },
  };
}
const context = vm.createContext({ URL, Request, Response, File, Blob, FormData, Buffer, console, crypto: nodeCrypto.webcrypto,
  process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'local-test-signature-key-only' } } });
const cache = new Map();
const mocks = {
  'server-only': {},
  zod: { z },
  'node:crypto': nodeCrypto,
  '@/lib/auth/server': { account: async () => active },
  '@/lib/db/server': { db, BUCKET_PROVAS: 'provas' },
  '@/lib/db/api': { privateHeaders: { 'cache-control': 'private, no-store' } },
};
async function load(specifier, parent) {
  if (mocks[specifier]) {
    if (!cache.has(specifier)) {
      const exports = mocks[specifier];
      cache.set(specifier, new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context }));
    } return cache.get(specifier);
  }
  const path = specifier.startsWith('@/') ? resolve('src', specifier.slice(2) + '.ts')
    : resolve(dirname(parent), specifier + '.ts');
  if (!cache.has(path)) {
    const code = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const mod = new vm.SourceTextModule(code, { context, identifier: pathToFileURL(path).href });
    cache.set(path, mod);
    await mod.link(child => load(child, path));
  } return cache.get(path);
}
const base = 'https://app.example.test';
const routeContext = { params: Promise.resolve({ provaId: exam }) };
const req = (method, body) => new Request(`${base}/api/aluno/provas/${exam}/envio`, {
  method, headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body),
});
try {
  await sql.exec(`create role anon; create role authenticated; create role service_role;
    create table provas(id uuid primary key,turma_id uuid,status text,analise jsonb);
    create table alunos(id uuid primary key,turma_id uuid,nome text,email text);
    create table submissoes(id uuid primary key,prova_id uuid,aluno_id uuid,arquivo_paths text[],arquivo_nomes text[],status text,correcao jsonb,erro text,nome_lido text,created_at timestamptz default now());
    create table respostas(submissao_id uuid,nota_final numeric);
    create table feedbacks(submissao_id uuid,publicado boolean);`);
  await sql.exec(readFileSync('supabase/prazos.sql', 'utf8'));
  await sql.query('insert into provas(id,turma_id,status) values($1,$2,$3)', [exam,room,'rascunho']);
  await sql.query('insert into alunos values($1,$2,$3,$4),($5,$2,$6,$7)', [studentA,room,a.nome,a.email,studentB,b.nome,b.email]);
  const mod = await load('@/app/api/aluno/provas/[provaId]/envio/route'); await mod.evaluate();
  const { PUT, POST } = mod.namespace;
  async function prepare(name) {
    const response = await PUT(req('PUT', { files: [{ name, type: 'image/png', size: png.length }] }), routeContext);
    assert.equal(response.status, 200);
    const { ticket } = await response.json();
    const payload = JSON.parse(Buffer.from(ticket.split('.')[0], 'base64url'));
    for (const file of payload.files) objects.set(file.path, new Blob([png], { type: 'image/png' }));
    return ticket;
  }
  const confirm = ticket => POST(req('POST', { ticket }), routeContext);
  assert.equal((await confirm(await prepare('original.png'))).status, 201);
  const original = (await sql.query('select * from submissoes')).rows[0];
  await sql.query('insert into respostas values($1,10);', [original.id]);
  await sql.query('insert into feedbacks values($1,true);', [original.id]);
  async function unchanged() {
    const rows = (await sql.query('select * from submissoes')).rows;
    assert.equal(rows.length, 1); assert.deepEqual(rows[0].arquivo_paths, original.arquivo_paths);
    for (const table of ['respostas','feedbacks']) assert.equal((await sql.query(`select count(*)::int n from ${table}`)).rows[0].n, 1);
    assert.ok(objects.has(original.arquivo_paths[0]), 'Recusa não remove arquivo anterior do Storage.');
  }
  const late = await prepare('atrasada.png');
  await sql.exec("update provas set prazo_envio=clock_timestamp()-interval '1 second'");
  assert.equal((await confirm(late)).status, 409); await unchanged();
  console.log('OK: ticket preparado e arquivo armazenado antes do fechamento não autorizam confirmação após ele.');

  await sql.query("update provas set excecoes_envio=jsonb_build_object($1::text,(clock_timestamp()+interval '1 day')::text)", [studentA]);
  active = b;
  const denied = await PUT(req('PUT', { files: [{ name: 'b.png', type: 'image/png', size: png.length }] }), routeContext);
  assert.equal(denied.status, 409);
  active = a; const authorized = await prepare('excecao-a.png');
  active = b; assert.equal((await confirm(authorized)).status, 409); await unchanged();
  await sql.exec('update provas set prazo_envio=null');
  assert.equal((await confirm(authorized)).status, 400, 'B com acesso à prova ainda não pode usar o ticket de A.');
  await unchanged();
  console.log('OK: contas da mesma turma têm exceções isoladas e ticket vinculado à identidade.');

  active = a; const race = await prepare('cruza-durante-confirmacao.png');
  await sql.exec("update provas set excecoes_envio='{}',prazo_envio=clock_timestamp()+interval '500 milliseconds'");
  onDownload = () => sql.exec('select pg_sleep(0.6)');
  const rejected = await confirm(race);
  assert.equal(rejected.status, 409);
  assert.match((await rejected.json()).error, /autorização mudou/);
  await unchanged();
  console.log('OK: prazo cruza após a checagem inicial do POST; RPC real recusa e mantém arquivo/correção/feedback.');

  await sql.exec("update provas set prazo_envio=clock_timestamp()-interval '1 second'");
  await sql.query("update provas set excecoes_envio=jsonb_build_object($1::text,(clock_timestamp()+interval '1 day')::text)", [studentA]);
  const revoke = await prepare('revogada-durante-confirmacao.png');
  onDownload = () => sql.exec("update provas set excecoes_envio='{}'");
  assert.equal((await confirm(revoke)).status, 409); await unchanged();
  console.log('OK: exceção revogada após a checagem inicial do POST também é conferida pela RPC.');
} finally { await sql.close(); }
