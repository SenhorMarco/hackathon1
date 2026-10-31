// Integração HTTP real com Next.js e Supabase simulado; não usa credenciais reais.
// Execute após npm run build: node scripts/testar-upload.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createCanvas } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { detectProva, validateProva, MAX_PROVA_BYTES } from '../src/lib/uploads/validation.ts';

const turmaId = 'f2a610b5-6bdd-4904-9e0e-36e9f1a6b582';
const records = new Map();
const files = new Map();
const submissions = new Map();
const alunos = new Map();
let failInsert = false;
const provider = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const raw = bytes.toString();
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
  if (url.pathname === '/rest/v1/alunos' && req.method === 'POST') {
    for (const row of JSON.parse(raw)) {
      const existing = [...alunos.values()].find(a => a.turma_id === row.turma_id && a.referencia_local === row.referencia_local);
      const id = existing?.id || crypto.randomUUID();
      alunos.set(id, { ...row, id });
    }
    return send(201, null);
  }
  if (url.pathname === '/rest/v1/alunos' && req.method === 'GET') {
    const rows = [...alunos.values()].filter(a => [...url.searchParams].every(([key, value]) => ['select','order'].includes(key) || a[key] === value.replace('eq.', '')));
    return send(200, rows);
  }
  if (url.pathname === '/rest/v1/submissoes' && req.method === 'POST') {
    if (failInsert) return send(500, { message: 'Falha simulada' });
    const row = { nome_lido: null, nome_leitura_erro: null, ...JSON.parse(raw), created_at: new Date().toISOString() };
    submissions.set(row.id, row);
    return send(201, row);
  }
  if (url.pathname === '/rest/v1/submissoes' && ['GET','PATCH'].includes(req.method)) {
    const rows = [...submissions.values()].filter(row => [...url.searchParams].every(([key, value]) => ['select','order'].includes(key) || row[key] === value.replace('eq.', '')));
    if (req.method === 'GET') return send(200, rows);
    for (const row of rows) Object.assign(row, JSON.parse(raw));
    return send(200, rows[0]);
  }
  if (url.pathname.startsWith('/storage/v1/object/provas/') && req.method === 'GET') {
    const file = files.get(url.pathname.replace('/storage/v1/object/provas/', ''));
    if (!file) return send(404, { message: 'Arquivo ausente' });
    res.writeHead(200, { 'Content-Type': file.mime }); res.end(file.bytes); return;
  }
  if (url.pathname.startsWith('/storage/v1/object/sign/')) return send(200, { signedURL: '/object/sign/provas/arquivo?token=teste' });
  if (url.pathname.startsWith('/storage/v1/object/provas/') && req.method === 'POST') {
    let storedBytes = bytes;
    let mime = req.headers['content-type'];
    if (mime?.startsWith('multipart/form-data')) {
      const form = await new Response(bytes, { headers: { 'Content-Type': mime } }).formData();
      const file = [...form.values()].find(value => value instanceof File);
      storedBytes = Buffer.from(await file.arrayBuffer()); mime = file.type;
    }
    files.set(url.pathname.replace('/storage/v1/object/provas/', ''), { bytes: storedBytes, mime });
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
// Simula somente a Featherless no processo filho; não há chamadas nem chaves reais de IA.
const aiMock = `const original = globalThis.fetch; globalThis.fetch = async (input, init) => {
 const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
 if (url.startsWith('https://api.featherless.ai/')) {
  const body = await new Request(input, init).json();
  if (!body.messages[1].content.some(p => p.type === 'image_url' && p.image_url.url.startsWith('data:image/png;base64,'))) throw new Error('Cabeçalho deve ser enviado como imagem PNG');
  return Response.json({choices:[{message:{content:JSON.stringify({nomeLido:'Nome fictício de teste'})}}]});
 }
 return original(input, init);
};`;
const app = spawn(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(aiMock), 'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  env: { ...process.env, SUPABASE_URL: providerUrl, SUPABASE_SERVICE_ROLE_KEY: 'chave-simulada-apenas-para-teste', FEATHERLESS_API_KEY: 'ia-simulada' },
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
  // Lote: PDFs independentes, imagens agrupadas e vínculo humano com aluno da turma.
  const examId = [...records.keys()][0];
  const batchBase = `${base}/api/exams/${examId}`;
  const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const rosterResponse = await fetch(`${batchBase}/students`, json([{ referencia_local: 'aluno-local-1', nome: 'Nome fictício de teste' }]));
  assert.equal(rosterResponse.status, 200);
  const { alunos: roster } = await rosterResponse.json();
  const repeatRoster = await fetch(`${batchBase}/students`, json([{ referencia_local: 'aluno-local-1', nome: 'Nome fictício de teste' }]));
  assert.equal((await repeatRoster.json()).alunos[0].id, roster[0].id);
  const canvas = createCanvas(400, 400);
  const context = canvas.getContext('2d');
  context.fillStyle = 'white'; context.fillRect(0, 0, 400, 400);
  context.fillStyle = 'black'; context.fillText('Nome ficticio', 20, 30);
  const image = () => new File([canvas.toBuffer('image/png')], 'pagina.png', { type: 'image/png' });
  const uploadSubmission = async (items, id = crypto.randomUUID()) => {
    const body = new FormData(); body.set('id', id); items.forEach(file => body.append('arquivos', file));
    return fetch(`${batchBase}/submissions`, { method: 'POST', body });
  };
  const twoPages = await uploadSubmission([image(), image()]);
  assert.equal(twoPages.status, 201, await twoPages.clone().text());
  const { submissao: grouped } = await twoPages.json();
  assert.equal(grouped.arquivo_paths.length, 2);
  assert.equal(grouped.aluno_id, null);
  const fileCount = files.size;
  assert.equal((await uploadSubmission([image(), image()], grouped.id)).status, 200);
  assert.equal(files.size, fileCount, 'Retentativa não deve duplicar arquivos');
  assert.equal((await uploadSubmission([pdf(), image()])).status, 400);
  assert.equal((await uploadSubmission([pdf(), pdf()])).status, 400);
  assert.equal((await uploadSubmission([new File(['falso'], 'falso.png', {type:'image/png'})])).status, 400);
  const read = await fetch(`${batchBase}/submissions/${grouped.id}/name`, { method: 'POST' });
  assert.equal(read.status, 200);
  const suggested = (await read.json()).submissao;
  assert.equal(suggested.nome_lido, 'Nome fictício de teste');
  assert.equal(suggested.nome_leitura_erro, null);
  assert.equal(suggested.aluno_id, null, 'Sugestão de IA nunca associa automaticamente');
  const patch = id => ({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aluno_id: id }) });
  const foreignId = crypto.randomUUID();
  alunos.set(foreignId, { id: foreignId, turma_id: crypto.randomUUID(), nome: 'Outra turma' });
  assert.equal((await fetch(`${batchBase}/submissions/${grouped.id}`, patch(foreignId))).status, 400);
  const confirmed = await fetch(`${batchBase}/submissions/${grouped.id}`, patch(roster[0].id));
  assert.equal(confirmed.status, 200);
  assert.equal((await confirmed.json()).submissao.aluno_id, roster[0].id);
  assert.equal((await fetch(`${batchBase}/submissions/${grouped.id}/file?index=1`, { redirect: 'manual' })).status, 302);
  assert.equal((await fetch(`${batchBase}/submissions/${grouped.id}/file?index=2`)).status, 404);
  const badPdf = (await (await uploadSubmission([pdf()])).json()).submissao;
  const failedReading = (await (await fetch(`${batchBase}/submissions/${badPdf.id}/name`, { method: 'POST' })).json()).submissao;
  assert.ok(failedReading.nome_leitura_erro);
  assert.equal(failedReading.nome_lido, null);
  assert.ok(files.has(failedReading.arquivo_paths[0]), 'Falha de IA preserva o upload');
  // PDF real mínimo: testa a renderização da primeira página antes da chamada de IA.
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const stream = 'BT /F1 16 Tf 20 370 Td (Nome ficticio) Tj ET';
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let document = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(document.length); document += `${i+1} 0 obj\n${object}\nendobj\n`; });
  const xref = document.length;
  document += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10,'0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const realPdf = (await (await uploadSubmission([new File([document], 'real.pdf', {type:'application/pdf'})])).json()).submissao;
  const pdfReadingResponse = await fetch(`${batchBase}/submissions/${realPdf.id}/name`, { method: 'POST' });
  const pdfReading = (await pdfReadingResponse.json()).submissao;
  assert.equal(pdfReading.nome_leitura_erro, null, JSON.stringify(pdfReading));
  assert.equal(pdfReading.nome_lido, 'Nome fictício de teste');
  const saved = (await (await fetch(`${batchBase}/submissions`)).json()).submissoes;
  assert.equal(saved.find(s => s.id === grouped.id).aluno_id, roster[0].id);
  const submissionCount = submissions.size;
  const beforeBatchFailure = files.size;
  failInsert = true;
  assert.equal((await uploadSubmission([image(),image()])).status, 500);
  assert.equal(files.size, beforeBatchFailure, 'Falha no banco remove todas as páginas do grupo');
  assert.equal(submissions.size, submissionCount);
  const before = files.size;
  failInsert = true;
  const failure = await post(form(pdf()));
  assert.equal(failure.status, 500);
  assert.ok(!(await failure.text()).includes('Falha simulada'));
  assert.equal(files.size, before, 'Falha no INSERT deve remover o arquivo');
  assert.equal(records.size, 3);
  console.log('Uploads validados: prova original, lote, imagens agrupadas, leitura de cabeçalho PDF/imagem, associação humana, turma, retentativa e compensação.');
} catch (error) {
  console.error(output);
  throw error;
} finally {
  const ended = app.exitCode === null ? once(app, 'exit') : Promise.resolve();
  app.kill('SIGTERM');
  await ended;
  await new Promise(resolve => provider.close(resolve));
}
