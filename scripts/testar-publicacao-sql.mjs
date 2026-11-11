// PostgreSQL nativo temporário: snapshot, publicação atômica e concorrência.
// EMBEDDED_POSTGRES_MODULE pode apontar para embedded-postgres/dist/index.js.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import ts from 'typescript';

const { default: EmbeddedPostgres } = await import(process.env.EMBEDDED_POSTGRES_MODULE || 'embedded-postgres');
const compiled = ts.transpileModule(readFileSync('src/lib/release-snapshot.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { releaseSnapshot } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; await new Promise(done => socket.close(done));
const directory = resolve('tmp', `postgres-publicacao-${randomUUID()}`);
const logs = [];
const pg = new EmbeddedPostgres({ databaseDir: directory, user: 'postgres', password: randomUUID(), port,
  persistent: true, autoRehydrateSymlinks: true, postgresFlags: ['-h', '127.0.0.1'],
  onLog: line => logs.push(String(line)), onError: line => logs.push(String(line)) });
const clients = [];
let started = false;
const teacher = randomUUID();
const barema = { questoes: [{ numero: 1, valorTotal: 2 }, { numero: 2, valorTotal: 3 }] };
const analise = { questoes: [{ numero: 1 }, { numero: 2 }] };
const feedbackContent = { resumo: 'Revisado', __revisao: 'a'.repeat(64), __aprovadoEm: '2026-11-10T12:00:00.000Z' };
const settle = promise => promise.then(value => ({ value }), error => ({ error }));

try {
  await pg.initialise(); await pg.start(); started = true;
  for (let i = 0; i < 3; i++) { const client = pg.getPgClient('postgres', '127.0.0.1'); await client.connect(); clients.push(client); }
  const [control, first, second] = clients;
  await control.query(`create role anon; create role authenticated; create role service_role;
    create table turmas(id uuid primary key, professor_id uuid not null);
    create table alunos(id uuid primary key, turma_id uuid not null references turmas(id));
    create table provas(id uuid primary key, turma_id uuid not null references turmas(id), status text not null,
      barema jsonb, analise jsonb);
    create table submissoes(id uuid primary key, prova_id uuid not null references provas(id), aluno_id uuid references alunos(id),
      status text not null, arquivo_paths text[] not null default '{}');
    create table respostas(id uuid primary key, prova_id uuid not null references provas(id), submissao_id uuid not null references submissoes(id),
      numero integer not null, correcao jsonb not null, nota_final numeric, comentario_final text);
    create table grupos(id uuid primary key, prova_id uuid not null references provas(id));
    create table feedbacks(id uuid primary key, submissao_id uuid not null unique references submissoes(id), conteudo jsonb not null, publicado boolean not null default false);`);
  const migration = readFileSync('supabase/publicacao.sql', 'utf8');
  await control.query(migration); await control.query(migration);
  console.log('OK: migração de publicação reaplicada no PostgreSQL nativo.');

  const fixture = async (count = 2) => {
    const room = randomUUID(), proof = randomUUID();
    await control.query('insert into turmas values($1,$2)', [room, teacher]);
    await control.query('insert into provas values($1,$2,$3,$4,$5)', [proof, room, 'corrigindo', barema, analise]);
    const submissions = [], answers = [], feedbacks = [];
    for (let i = 0; i < count; i++) {
      const student = randomUUID(), submission = randomUUID();
      await control.query('insert into alunos values($1,$2)', [student, room]);
      const submissionRow = { id: submission, prova_id: proof, aluno_id: student, status: 'corrigida', arquivo_paths: [`${submission}/p1.png`] };
      await control.query('insert into submissoes values($1,$2,$3,$4,$5)', [submission, proof, student, 'corrigida', submissionRow.arquivo_paths]);
      submissions.push(submissionRow);
      for (const q of [1, 2]) {
        const answer = { id: randomUUID(), prova_id: proof, submissao_id: submission, numero: q,
          correcao: { transcricao: `aluno ${i + 1} questão ${q}` }, nota_final: q, comentario_final: 'Validado' };
        await control.query('insert into respostas values($1,$2,$3,$4,$5,$6,$7)', [answer.id, proof, submission, q, answer.correcao, answer.nota_final, answer.comentario_final]);
        answers.push(answer);
      }
      const feedback = { id: randomUUID(), submissao_id: submission, conteudo: feedbackContent };
      await control.query('insert into feedbacks values($1,$2,$3,false)', [feedback.id, submission, feedback.conteudo]);
      feedbacks.push(feedback);
    }
    const proofRow = { id: proof, turma_id: room, status: 'corrigindo', barema, analise };
    return { proof, room, proofRow, submissions, answers, feedbacks };
  };
  const jsSnapshot = f => releaseSnapshot(f.proofRow, f.submissions, f.answers, f.feedbacks);
  const sqlSnapshot = async proof => (await control.query('select snapshot_publicacao($1) snapshot', [proof])).rows[0].snapshot;
  const rpc = (client, proof, owner, snapshot) => client.query('select publicar_prova($1,$2,$3) result', [proof, owner, snapshot]);
  const asService = async fn => {
    await control.query('set role service_role');
    try { return await fn(); } finally { await control.query('reset role'); }
  };
  const assertUnpublished = async proof => {
    assert.equal((await control.query('select status from provas where id=$1', [proof])).rows[0].status, 'corrigindo');
    assert.ok((await control.query('select bool_and(not publicado) ok from feedbacks f join submissoes s on s.id=f.submissao_id where s.prova_id=$1', [proof])).rows[0].ok);
  };
  const base = await fixture();
  assert.deepEqual(jsSnapshot(base), await sqlSnapshot(base.proof), 'snapshot TypeScript coincide semanticamente com snapshot jsonb SQL');
  await control.query('insert into grupos values($1,$2)', [randomUUID(), base.proof]);
  await assert.rejects(control.query('update feedbacks set publicado=true where id=$1', [base.feedbacks[0].id]), error => error.code === '55000', 'não permite publicar feedback diretamente');
  await assert.rejects(control.query("update provas set status='corrigida' where id=$1", [base.proof]), error => error.code === '55000', 'não permite publicar prova diretamente');
  await assertUnpublished(base.proof);
  await assert.rejects(asService(() => rpc(control, base.proof, randomUUID(), jsSnapshot(base))), error => error.code === 'P0002', 'recusa professor que não é dono da turma');
  for (const role of ['anon', 'authenticated']) {
    await control.query(`set role ${role}`);
    await assert.rejects(rpc(control, base.proof, teacher, jsSnapshot(base)), error => error.code === '42501', `${role} não executa RPC`);
    await control.query('reset role');
  }
  const published = await asService(() => rpc(control, base.proof, teacher, jsSnapshot(base)));
  assert.equal(published.rows[0].result.liberadas, 2);
  assert.equal((await control.query('select count(*)::int n from feedbacks f join submissoes s on s.id=f.submissao_id where s.prova_id=$1 and f.publicado', [base.proof])).rows[0].n, 2);
  assert.equal((await control.query('select status from provas where id=$1', [base.proof])).rows[0].status, 'corrigida');
  assert.equal((await asService(() => rpc(control, base.proof, teacher, jsSnapshot(base)))).rows[0].result.liberadas, 2, 'repetição idempotente');
  await assert.rejects(control.query("update submissoes set arquivo_paths=array['alterado.png'] where id=$1", [base.submissions[0].id]), error => error.code === '55000', 'congela arquivos da submissão após publicação');
  await assert.rejects(control.query("update provas set barema=jsonb_set(barema,'{questoes,0,valorTotal}','4'::jsonb) where id=$1", [base.proof]), error => error.code === '55000', 'congela barema após publicação');
  await assert.rejects(control.query('insert into grupos values($1,$2)', [randomUUID(), base.proof]), error => error.code === '55000', 'não permite criar grupo após publicação');
  const savedGroup = (await control.query('select id from grupos where prova_id=$1 limit 1', [base.proof])).rows[0].id;
  await assert.rejects(control.query('update grupos set id=$1 where id=$2', [randomUUID(), savedGroup]), error => error.code === '55000', 'não permite editar grupo após publicação');
  await assert.rejects(control.query('delete from grupos where id=$1', [savedGroup]), error => error.code === '55000', 'não permite excluir grupo após publicação');
  console.log('OK: snapshot igual entre JS e SQL; guards diretos e pós-publicação; dono obrigatório; RPC negada a anon/authenticated; publicação e retry idempotente.');

  const staleCases = [
    ['nota', f => control.query('update respostas set nota_final=nota_final+0.25 where id=$1', [f.answers[0].id])],
    ['arquivo', f => control.query("update submissoes set arquivo_paths=array['novo.png'] where id=$1", [f.submissions[0].id])],
    ['barema', f => control.query("update provas set barema=jsonb_set(barema,'{questoes,0,valorTotal}','4'::jsonb) where id=$1", [f.proof])],
    ['nova submissão', async f => {
      const student = randomUUID(), submission = randomUUID();
      await control.query('insert into alunos values($1,$2)', [student, f.room]);
      await control.query('insert into submissoes values($1,$2,$3,$4,$5)', [submission, f.proof, student, 'corrigida', ['extra.png']]);
    }],
    ['feedback', f => control.query("update feedbacks set conteudo=jsonb_set(conteudo,'{resumo}',to_jsonb($1::text)) where id=$2", ['Mudou', f.feedbacks[0].id])],
  ];
  for (const [label, mutate] of staleCases) {
    const f = await fixture(); const snapshot = jsSnapshot(f);
    await mutate(f);
    await assert.rejects(asService(() => rpc(control, f.proof, teacher, snapshot)), error => error.code === 'PT409', `snapshot antigo após ${label}`);
    await assertUnpublished(f.proof);
  }
  console.log('OK: snapshots antigos após alteração de nota, arquivo, barema, submissão nova ou feedback retornam PT409 sem publicação parcial.');

  const rollbackFixture = await fixture();
  await control.query(`create function falhar_depois_de_publicar() returns trigger language plpgsql as $$ begin
    if new.status='corrigida' then raise exception 'falha sintética após atualizar a prova' using errcode='P0001'; end if; return new; end $$;
    create trigger teste_falha_publicacao after update of status on provas for each row execute function falhar_depois_de_publicar()`);
  await assert.rejects(asService(() => rpc(control, rollbackFixture.proof, teacher, jsSnapshot(rollbackFixture))), error => error.message.includes('falha sintética'));
  await control.query('drop trigger teste_falha_publicacao on provas; drop function falhar_depois_de_publicar()');
  await assertUnpublished(rollbackFixture.proof);
  console.log('OK: falha forçada após atualizar prova faz rollback de status e todas as flags de feedback.');

  async function backendPid(client) {
    return Number((await client.query('select pg_backend_pid() pid')).rows[0].pid);
  }
  async function waitForLock(pid) {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      const row = (await control.query('select wait_event_type from pg_stat_activity where pid=$1', [pid])).rows[0];
      if (row?.wait_event_type === 'Lock') return;
      await delay(20);
    }
    assert.fail('A outra conexão deveria estar aguardando um bloqueio PostgreSQL observável.');
  }
  const gradeRace = await fixture(1); const gradeSnapshot = jsSnapshot(gradeRace);
  await first.query('begin');
  await first.query('update respostas set nota_final=nota_final+0.5 where id=$1', [gradeRace.answers[0].id]);
  const secondPid = await backendPid(second);
  await second.query('set role service_role');
  let waiting = settle(rpc(second, gradeRace.proof, teacher, gradeSnapshot));
  await waitForLock(secondPid); await first.query('commit');
  assert.equal((await waiting).error?.code, 'PT409', 'publicação aguarda nota em curso e depois recusa snapshot antigo');
  await second.query('reset role');
  await assertUnpublished(gradeRace.proof);
  console.log('OK: publicação bloqueou por alteração de nota em curso; após commit, snapshot obsoleto recusado sem flags parciais.');

  const lateGrade = await fixture(1); const lateGradeSnapshot = jsSnapshot(lateGrade);
  await first.query('set role service_role');
  await first.query('begin');
  await rpc(first, lateGrade.proof, teacher, lateGradeSnapshot);
  const oldGrade = Number((await control.query('select nota_final from respostas where id=$1', [lateGrade.answers[0].id])).rows[0].nota_final);
  const secondGradePid = await backendPid(second);
  waiting = settle(second.query('update respostas set nota_final=nota_final+0.75 where id=$1', [lateGrade.answers[0].id]));
  await waitForLock(secondGradePid); await first.query('commit'); await first.query('reset role');
  assert.equal((await waiting).error?.code, '55000', 'alteração de nota posterior à publicação é bloqueada');
  assert.equal(Number((await control.query('select nota_final from respostas where id=$1', [lateGrade.answers[0].id])).rows[0].nota_final), oldGrade);
  console.log('OK: gravação de nota iniciada após publicação aguardou lock e foi negada (55000), sem mudança.');

  const lateFeedback = await fixture(1); const lateFeedbackSnapshot = jsSnapshot(lateFeedback);
  await first.query('set role service_role');
  await first.query('begin');
  await rpc(first, lateFeedback.proof, teacher, lateFeedbackSnapshot);
  const oldFeedback = (await control.query('select conteudo from feedbacks where id=$1', [lateFeedback.feedbacks[0].id])).rows[0].conteudo;
  const secondFeedbackPid = await backendPid(second);
  waiting = settle(second.query('update feedbacks set conteudo=$2 where id=$1', [lateFeedback.feedbacks[0].id, JSON.stringify({ ...feedbackContent, resumo: 'Edição tardia' })]));
  await waitForLock(secondFeedbackPid); await first.query('commit'); await first.query('reset role');
  assert.equal((await waiting).error?.code, '55000', 'edição de feedback posterior à publicação é bloqueada');
  assert.deepEqual((await control.query('select conteudo from feedbacks where id=$1', [lateFeedback.feedbacks[0].id])).rows[0].conteudo, oldFeedback);
  console.log('OK: edição de feedback iniciada após publicação aguardou lock e foi negada (55000), texto preservado.');
  console.log(`PostgreSQL ${String((await control.query('show server_version')).rows[0].server_version)}; 3 conexões; fixtures somente em ${directory}.`);
} catch (error) {
  console.error(error);
  console.error(logs.slice(-8).join('\n'));
  throw error;
} finally {
  for (const client of clients) { await client.query('rollback').catch(() => {}); await client.end(); }
  if (started) await pg.stop();
}
