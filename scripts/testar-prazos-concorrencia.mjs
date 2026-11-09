// PostgreSQL nativo temporário, várias conexões e bloqueios observados.
// Instale embedded-postgres num ambiente de testes; não é dependência do app.
// EMBEDDED_POSTGRES_MODULE pode apontar para dist/index.js do pacote.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const { default: EmbeddedPostgres } = await import(process.env.EMBEDDED_POSTGRES_MODULE || 'embedded-postgres');
const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; await new Promise(done => socket.close(done));
const directory = resolve('tmp', `postgres-prazos-${randomUUID()}`);
const logs = [];
const pg = new EmbeddedPostgres({ databaseDir: directory, user: 'postgres', password: randomUUID(), port,
  persistent: true, autoRehydrateSymlinks: true, postgresFlags: ['-h', '127.0.0.1'],
  onLog: line => logs.push(String(line)), onError: line => logs.push(String(line)) });
const clients = [];
let started = false;
try {
  await pg.initialise(); await pg.start(); started = true;
  for (let i = 0; i < 3; i++) { const client = pg.getPgClient('postgres', '127.0.0.1'); await client.connect(); clients.push(client); }
  const [control, first, second] = clients;
  await control.query(`create role anon; create role authenticated; create role service_role;
    create table provas(id uuid primary key,turma_id uuid,status text);
    create table alunos(id uuid primary key,turma_id uuid);
    create table submissoes(id uuid primary key,prova_id uuid,aluno_id uuid,arquivo_paths text[],arquivo_nomes text[],status text,correcao jsonb,erro text,nome_lido text,created_at timestamptz default now());
    create table respostas(submissao_id uuid,nota_final numeric);
    create table feedbacks(submissao_id uuid,publicado boolean);`);
  await control.query(readFileSync('supabase/prazos.sql', 'utf8'));
  const exam = randomUUID(), student = randomUUID(), submission = randomUUID();
  await control.query('insert into provas(id,turma_id,status) values($1,$1,$2)', [exam,'rascunho']);
  await control.query('insert into alunos values($1,$2)', [student,exam]);
  const pid = Number((await second.query('select pg_backend_pid() pid')).rows[0].pid);
  const call = (client, id, previous, paths) => client.query('select confirmar_envio_aluno($1,$2,$3,$4,$5,$5,$6,false)',
    [exam,student,id,previous,paths,'Aluno sintético']);
  const settle = promise => promise.then(value => ({ value }), error => ({ error }));
  async function blocked() {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      const row = (await control.query('select wait_event_type from pg_stat_activity where pid=$1', [pid])).rows[0];
      if (row?.wait_event_type === 'Lock') return;
      await delay(20);
    }
    assert.fail('A segunda conexão deve realmente aguardar o bloqueio da primeira.');
  }
  async function unchanged(expected) {
    const rows = (await control.query('select * from submissoes')).rows;
    assert.equal(rows.length, 1); assert.deepEqual(rows[0].arquivo_paths, expected);
  }
  await first.query('begin');
  await call(first, submission, null, ['primeiro.png']);
  let queued = settle(call(second, randomUUID(), null, ['duplicado.png']));
  await blocked(); await first.query('commit');
  assert.equal((await queued).error?.code, 'P0001'); await unchanged(['primeiro.png']);
  console.log('OK: primeiros envios concorrentes serializados; segunda conexão bloqueou e foi recusada, sem duplicar submissão.');

  await control.query('insert into respostas values($1,10);', [submission]);
  await control.query('insert into feedbacks values($1,true);', [submission]);
  await first.query('begin');
  await call(first, submission, ['primeiro.png'], ['vencedor.png']);
  queued = settle(call(second, submission, ['primeiro.png'], ['perdedor.png']));
  await blocked(); await first.query('commit');
  assert.equal((await queued).error?.code, 'P0001'); await unchanged(['vencedor.png']);
  for (const table of ['respostas','feedbacks']) assert.equal(Number((await control.query(`select count(*) n from ${table}`)).rows[0].n), 0);
  console.log('OK: substituições da mesma versão não se sobrescrevem; apenas a vencedora invalida a correção anterior.');

  // Revogação já em andamento: a confirmação espera e vê o estado confirmado.
  await control.query("update provas set prazo_envio=clock_timestamp()-interval '1 day',excecoes_envio=jsonb_build_object($1::text,(clock_timestamp()+interval '1 day')::text)", [student]);
  await control.query('insert into respostas values($1,9);', [submission]);
  await control.query('insert into feedbacks values($1,true);', [submission]);
  await first.query('begin');
  await first.query("update provas set excecoes_envio='{}'");
  queued = settle(call(second, submission, ['vencedor.png'], ['apos-revogacao.png']));
  await blocked(); await first.query('commit');
  assert.equal((await queued).error?.code, 'P0001'); await unchanged(['vencedor.png']);
  for (const table of ['respostas','feedbacks']) assert.equal(Number((await control.query(`select count(*) n from ${table}`)).rows[0].n), 1);
  console.log('OK: revogação concorrente já bloqueando a prova prevalece; arquivo e correção anterior preservados.');

  // A transação de envio começa no prazo, mas fica presa em outro bloqueio.
  await control.query("update provas set prazo_envio=clock_timestamp()+interval '1 second'");
  await first.query('begin'); await first.query('select * from provas for update');
  await second.query('begin');
  queued = settle(call(second, submission, ['vencedor.png'], ['apos-espera.png']));
  await blocked();
  await first.query('select pg_sleep(1.1)'); await first.query('commit');
  assert.equal((await queued).error?.code, 'P0001'); await second.query('rollback');
  await unchanged(['vencedor.png']);
  for (const table of ['respostas','feedbacks']) assert.equal(Number((await control.query(`select count(*) n from ${table}`)).rows[0].n), 1);
  console.log('OK: espera por bloqueio atravessando o prazo usa relógio atual e recusa a finalização.');
  console.log(`PostgreSQL ${String((await control.query('show server_version')).rows[0].server_version)}; 3 conexões; dados sintéticos em ${directory}.`);
} catch (error) {
  console.error(error);
  // Logs locais do PostgreSQL não contêm credenciais ou dados do deploy.
  console.error(logs.slice(-8).join('\n')); throw error;
} finally {
  for (const client of clients) { await client.query('rollback').catch(() => {}); await client.end(); }
  if (started) await pg.stop();
}
