// PostgreSQL local em memória; não usa credenciais nem banco de produção.
// PGLITE_MODULE pode apontar para o pacote PGlite instalado para esta verificação.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const prova = '10000000-0000-4000-8000-000000000001';
const aluno = '10000000-0000-4000-8000-000000000002';
const outro = '10000000-0000-4000-8000-000000000003';
const envio = '10000000-0000-4000-8000-000000000004';
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table provas(id uuid primary key,turma_id uuid,status text);
    create table alunos(id uuid primary key,turma_id uuid);
    create table submissoes(id uuid primary key,prova_id uuid,aluno_id uuid,arquivo_paths text[],arquivo_nomes text[],status text,correcao jsonb,erro text,nome_lido text,created_at timestamptz default now());
    create table respostas(submissao_id uuid,nota_final numeric);
    create table feedbacks(submissao_id uuid,publicado boolean);`);
  const migration = readFileSync('supabase/prazos.sql','utf8');
  await db.exec(migration);
  await db.exec(migration);
  await db.query('insert into provas(id,turma_id,status) values($1,$1,$2)',[prova,'corrigindo']);
  await db.query('insert into alunos values($1,$2),($3,$3)',[aluno,prova,outro]);
  const call = (previous, paths=['nova.png'], student=aluno, remove=false) => db.query(
    'select confirmar_envio_aluno($1,$2,$3,$4,$5,$6,$7,$8) as envio',
    [prova,student,envio,previous,paths,paths,'Aluno sintético',remove]);
  await call(null,['original.png']);
  await db.query('insert into respostas values($1,5);',[envio]);
  await db.query('insert into feedbacks values($1,true);',[envio]);
  await assert.rejects(call(['versao-errada.png']),/envio mudou/i);
  assert.equal((await db.query('select count(*)::int n from respostas')).rows[0].n,1);
  await db.exec("update provas set prazo_envio = clock_timestamp() - interval '1 second'");
  await assert.rejects(call(['original.png']),/Prazo encerrado/i);
  assert.equal((await db.query('select arquivo_paths from submissoes')).rows[0].arquivo_paths[0],'original.png');
  await db.query("update provas set excecoes_envio = jsonb_build_object($1::text,(clock_timestamp()+interval '1 day')::text)",[aluno]);
  await assert.rejects(call(['original.png'],['outra.png'],outro),/não autorizado/i);
  await call(['original.png']);
  assert.equal((await db.query('select count(*)::int n from respostas')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from feedbacks')).rows[0].n,0);
  assert.equal((await db.query('select status from submissoes')).rows[0].status,'enviada');
  await db.exec("update provas set excecoes_envio='{}'");
  await assert.rejects(call(['nova.png']),/Prazo encerrado/i);
  await db.exec("update provas set prazo_envio=null,status='corrigida'");
  await assert.rejects(call(['nova.png']),/prova publicada/i);
  await db.exec("update provas set status='corrigindo'");
  await call(['nova.png'],[],aluno,true);
  assert.equal((await db.query('select count(*)::int n from submissoes')).rows[0].n,0);
  await db.exec('set role anon');
  await assert.rejects(call(null),/permission denied/i);
  await db.exec('reset role');
  console.log('OK: migração reaplicável, prazo/escopo/exceção, revogação, publicação, conflito de arquivos, invalidação e permissão da RPC em PostgreSQL local.');
} finally { await db.close(); }
