// Integração HTTP real com Next.js e Supabase simulado; não usa credenciais reais.
// Execute após npm run build: node scripts/testar-upload.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { detectProva, validateProva, MAX_PROVA_BYTES } from '../src/lib/uploads/validation.ts';

const turmaId = 'f2a610b5-6bdd-4904-9e0e-36e9f1a6b582';
const records = new Map();
const files = new Set();
let failInsert = false;
const provider = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString();
  res.setHeader('Content-Type', 'application/json');
  const send = (status, body) => { res.writeHead(status); res.end(JSON.stringify(body)); };
  if (url.pathname === '/rest/v1/turmas' && req.method === 'POST') return send(201, null);
  if (url.pathname === '/rest/v1/provas' && req.method === 'POST') {
    if (failInsert) return send(500, { message: 'Falha simulada' });
    const row = { ...JSON.parse(raw), created_at: new Date().toISOString() };
    records.set(row.id, row);
    return send(201, row);
  }
  if (url.pathname === '/rest/v1/provas' && req.method === 'GET') {
    const id = url.searchParams.get('id')?.replace('eq.', '');
    if (id) return send(200, [...records.values()].filter(row => row.id === id));
    return send(200, [...records.values()].filter(row => row.turma_id === url.searchParams.get('turma_id')?.replace('eq.', '')));
  }
  if (url.pathname.startsWith('/storage/v1/object/sign/')) return send(200, { signedURL: '/object/sign/provas/arquivo?token=teste' });
  if (url.pathname.startsWith('/storage/v1/object/provas/') && req.method === 'POST') {
    files.add(url.pathname.replace('/storage/v1/object/provas/', ''));
    return send(200, { Key: url.pathname });
  }
  if (url.pathname === '/storage/v1/object/provas' && req.method === 'DELETE') {
    for (const path of JSON.parse(raw).prefixes) files.delete(path);
    return send(200, []);
  }
  return send(404, { message: `Rota simulada desconhecida: ${req.method} ${url.pathname}` });
});
provider.listen(0, '127.0.0.1');
await once(provider, 'listening');
const providerUrl = `http://127.0.0.1:${provider.address().port}`;
// Reserva uma porta livre para o processo Next de teste.
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  env: { ...process.env, SUPABASE_URL: providerUrl, SUPABASE_SERVICE_ROLE_KEY: 'chave-simulada-apenas-para-teste' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
app.stdout.on('data', chunk => { output += chunk; });
app.stderr.on('data', chunk => { output += chunk; });
function form(file) {
  const data = new FormData();
  data.set('titulo', 'Prova de integração');
  data.set('data_avaliacao', '2026-10-31');
  data.set('turma_id', turmaId);
  data.set('turma_nome', 'Turma de teste');
  if (file) data.set('arquivo', file);
  return data;
}
const post = body => fetch(`${base}/api/exams`, { method: 'POST', body });
const pdf = () => new File(['%PDF-1.7\nTeste de transporte'], 'prova.pdf', { type: 'application/pdf' });
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (app.exitCode !== null) throw new Error(output);
    try { await fetch(`${base}/api/exams`); ready = true; break; } catch { await delay(250); }
  }
  assert.ok(ready, 'Servidor Next deve iniciar');
  assert.equal(validateProva(new File([], 'vazio.pdf')), 'O arquivo está vazio.');
  assert.ok(validateProva(new File([new Uint8Array(MAX_PROVA_BYTES + 1)], 'grande.pdf')));
  assert.equal(await detectProva(new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'foto.png', { type: 'image/png' })), 'image/png');
  assert.equal(await detectProva(new File([new Uint8Array([255,216,255])], 'foto.jpeg', { type: 'image/jpeg' })), 'image/jpeg');
  assert.equal((await post(form())).status, 400);
  assert.equal((await post(form(new File(['texto'], 'falso.pdf', { type: 'application/pdf' })))).status, 400);
  assert.equal((await post(form(new File(['texto'], 'prova.doc')))).status, 400);
  assert.equal((await post('{}')).status, 415);
  const invalid = form(pdf()); invalid.set('turma_id', 'c0');
  assert.equal((await post(invalid)).status, 400);
  const oversized = await fetch(`${base}/api/exams`, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=teste' }, body: new Uint8Array(MAX_PROVA_BYTES + 1024 * 1024 + 1) });
  assert.equal(oversized.status, 413);
  for (const file of [pdf(), new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'foto.png', { type: 'image/png' }), new File([new Uint8Array([255,216,255])], 'foto.jpg', { type: 'image/jpeg' })]) {
    const response = await post(form(file));
    assert.equal(response.status, 201, await response.clone().text());
    const { prova } = await response.json();
    assert.equal(prova.status, 'rascunho');
    assert.equal(prova.arquivo_nome, file.name);
    assert.equal(prova.data_avaliacao, '2026-10-31');
    assert.ok(files.has(prova.arquivo_path));
    const detail = await fetch(`${base}/api/exams/${prova.id}`);
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).prova.id, prova.id);
    const download = await fetch(`${base}/api/exams/${prova.id}/file`, { redirect: 'manual' });
    assert.equal(download.status, 302);
    assert.ok(download.headers.get('location').includes('token=teste'));
    assert.equal(download.headers.get('cache-control'), 'no-store');
  }
  const list = await fetch(`${base}/api/exams?turma_id=${turmaId}`);
  assert.equal((await list.json()).provas.length, 3);
  assert.equal((await fetch(`${base}/api/exams/invalido`)).status, 400);
  const absent = '92aef724-53df-46a2-a684-b6934db3a839';
  assert.equal((await fetch(`${base}/api/exams/${absent}`)).status, 404);
  assert.equal((await fetch(`${base}/api/exams/${absent}/file`)).status, 404);
  const before = files.size;
  failInsert = true;
  const failure = await post(form(pdf()));
  assert.equal(failure.status, 500);
  assert.ok(!(await failure.text()).includes('Falha simulada'));
  assert.equal(files.size, before, 'Falha no INSERT deve remover o arquivo');
  assert.equal(records.size, 3);
  console.log('Upload validado: PDF/PNG/JPEG, erros, tamanho, persistência, consulta, link privado e compensação.');
} catch (error) {
  console.error(output);
  throw error;
} finally {
  const ended = app.exitCode === null ? once(app, 'exit') : Promise.resolve();
  app.kill('SIGTERM');
  await ended;
  await new Promise(resolve => provider.close(resolve));
}
