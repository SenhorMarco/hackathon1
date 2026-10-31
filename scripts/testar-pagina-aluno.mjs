// Next.js real com banco simulado. Não chama IA nem usa dados de produção.
// Após npm run build:
// PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node scripts/testar-pagina-aluno.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ids = Array.from({ length: 8 }, (_, i) => `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const [examA, examB, subA, subB, studentA, studentB, answerA, answerB] = ids;
const tokenA = 'a'.repeat(32), tokenB = 'b'.repeat(32);
const feedback = name => ({ resumo: `Resumo sintético de ${name}`, questoes: [{ numero: 1, acertos: `Acerto de ${name}`, erro: 'Erro sintético', porque: 'Explicação sintética', dica: 'Dica sintética', exercicios: [{ enunciado: 'Quanto é 2 + 2?', resposta: '4' }] }], proximosPassos: ['Revisar a questão 1'] });
const barema = { questoes: [{ numero: 1, valorTotal: 2, criterios: [{ id: 'q1', descricao: 'Critério sintético', pontos: 2 }] }] };
const tables = {
  provas: [{ id: examA, titulo: 'Prova sintética A', barema, status: 'corrigindo' }, { id: examB, titulo: 'Prova sintética B', barema, status: 'corrigida' }],
  alunos: [{ id: studentA, nome: 'ALUNO SINTETICO A' }, { id: studentB, nome: 'ALUNO SINTETICO B' }],
  submissoes: [{ id: subA, prova_id: examA, aluno_id: studentA, status: 'corrigida' }, { id: subB, prova_id: examB, aluno_id: studentB, status: 'corrigida' }],
  respostas: [{ id: answerA, submissao_id: subA, prova_id: examA, numero: 1, nota_final: 1.5, comentario_final: 'AJUSTE FINAL DO PROFESSOR A' }, { id: answerB, submissao_id: subB, prova_id: examB, numero: 1, nota_final: 2, comentario_final: 'AJUSTE FINAL DO PROFESSOR B' }],
  feedbacks: [{ submissao_id: subA, token: tokenA, conteudo: feedback('A'), publicado: false }, { submissao_id: subB, token: tokenB, conteudo: feedback('B'), publicado: true }],
};
let failTable = '';
let requests = 0;
const provider = createServer(async (req, res) => {
  requests++;
  const url = new URL(req.url, 'http://localhost');
  const table = url.pathname.replace('/rest/v1/', '');
  res.setHeader('Content-Type', 'application/json');
  if (table === failTable) { res.writeHead(500); res.end(JSON.stringify({ message: 'DETALHE_INTERNO_PROVEDOR_NAO_EXIBIR' })); return; }
  if (!tables[table]) { res.writeHead(404); res.end('null'); return; }
  const filtered = tables[table].filter(row => [...url.searchParams].every(([key, val]) => {
    if (['select', 'order', 'limit'].includes(key)) return true;
    if (val === 'is.null') return row[key] === null;
    if (val === 'not.is.null') return row[key] != null;
    if (val.startsWith('in.(')) return val.slice(4, -1).split(',').includes(row[key]);
    return String(row[key]) === val.slice(3);
  }));
  if (req.method === 'PATCH') {
    const chunks = []; for await (const c of req) chunks.push(c);
    const change = JSON.parse(Buffer.concat(chunks));
    for (const row of filtered) Object.assign(row, change);
  }
  res.setHeader('Content-Range', filtered.length ? `0-${filtered.length - 1}/${filtered.length}` : '*/0');
  res.end(JSON.stringify(filtered));
});
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
const appPort = Number(process.env.TEST_PORT || 3191);
const base = `http://127.0.0.1:${appPort}`;
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(appPort)], {
  env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${provider.address().port}`, SUPABASE_SERVICE_ROLE_KEY: 'chave-sintetica-local', FEATHERLESS_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
app.stdout.on('data', c => { output += c; }); app.stderr.on('data', c => { output += c; });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (app.exitCode !== null) throw Error('Servidor Next não iniciou.');
    try { await fetch(base); ready = true; break; } catch { await delay(250); }
  }
  assert.ok(ready);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();
  async function visit(token) { await page.goto(`${base}/aluno/${token}`); }
  async function unavailable(token) {
    await visit(token); await page.getByRole('heading', { name: 'Devolutiva indisponível' }).waitFor();
    assert.ok(!(await page.locator('main').innerText()).includes('ALUNO SINTETICO'));
  }
  let before = requests;
  await unavailable('token-invalido'); assert.equal(requests, before, 'Token malformado não consulta o banco');
  await unavailable('c'.repeat(32));
  await unavailable(tokenA);
  console.log('✓ token inválido, inexistente e ainda não publicado não exibem dados');

  const release = await fetch(`${base}/api/exams/${examA}/release`, { method: 'POST' });
  assert.equal(release.status, 200, await release.text());
  assert.equal(tables.feedbacks[0].token, tokenA, 'Liberação mantém o link');
  await visit(tokenA);
  await page.getByRole('heading', { name: 'Prova sintética A' }).waitFor();
  assert.equal(await page.locator('main').getByText('ALUNO SINTETICO A', { exact: true }).count(), 1);
  await page.getByText('1,5 / 2', { exact: true }).waitFor();
  await page.getByText('AJUSTE FINAL DO PROFESSOR A', { exact: false }).waitFor();
  await page.getByText('Ver resposta', { exact: true }).click();
  assert.ok((await page.locator('details[open]').innerText()).includes('4'));
  assert.ok(!(await page.locator('main').innerText()).includes('ALUNO SINTETICO B'));
  assert.equal(await page.locator('meta[name="referrer"]').getAttribute('content'), 'no-referrer');
  assert.ok((await page.locator('meta[name="robots"]').first().getAttribute('content')).includes('noindex'));
  assert.deepEqual(await context.cookies(), [], 'Acesso sem sessão de login');
  console.log('✓ liberação real pela rota, notas/comentários finais e exercícios sem login');

  const other = await browser.newContext(); const otherPage = await other.newPage();
  await otherPage.goto(`${base}/aluno/${tokenB}`);
  await otherPage.getByText('ALUNO SINTETICO B', { exact: true }).waitFor();
  assert.ok(!(await otherPage.locator('main').innerText()).includes('ALUNO SINTETICO A'));
  await other.close();
  tables.feedbacks[0].publicado = false;
  await unavailable(tokenA);
  tables.feedbacks[0].publicado = true;
  console.log('✓ links isolados em contextos independentes e retirada de publicação após visita');

  const originalStudent = tables.submissoes[0].aluno_id;
  tables.submissoes[0].aluno_id = null; await unavailable(tokenA); tables.submissoes[0].aluno_id = originalStudent;
  const originalSubmissions = tables.submissoes;
  tables.submissoes = tables.submissoes.filter(s => s.id !== subA); await unavailable(tokenA); tables.submissoes = originalSubmissions;
  console.log('✓ associação ausente e submissão inexistente sem quebra de renderização');

  failTable = 'respostas';
  await visit(tokenA);
  await page.getByRole('heading', { name: 'Não foi possível carregar sua devolutiva' }).waitFor();
  assert.ok(!(await page.locator('body').innerText()).includes('DETALHE_INTERNO_PROVEDOR'));
  failTable = '';
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await page.getByRole('heading', { name: 'Prova sintética A' }).waitFor();
  console.log('✓ falha temporária de banco com mensagem genérica e recuperação pelo botão');

  for (const value of [null, { resumo: 'Conteúdo inválido' }]) {
    const original = tables.feedbacks[0].conteudo; tables.feedbacks[0].conteudo = value;
    await visit(tokenA); await page.getByRole('heading', { name: 'Não foi possível carregar sua devolutiva' }).waitFor();
    tables.feedbacks[0].conteudo = original;
  }
  tables.respostas[0].nota_final = null;
  await visit(tokenA); await page.getByRole('heading', { name: 'Não foi possível carregar sua devolutiva' }).waitFor();
  assert.equal(await page.getByText('0 / 2', { exact: true }).count(), 0);
  tables.respostas[0].nota_final = 1.5;
  tables.alunos[0].nome = 'ALUNO_SINTETICO_COM_NOME_MUITO_LONGO_PARA_CONFERIR_A_LEITURA_NO_CELULAR';
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(tokenA); await page.getByRole('heading', { name: 'Prova sintética A' }).waitFor();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('main')).display === 'grid');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true });
  console.log('✓ conteúdo inválido e nota pendente não mostram notas inventadas; página móvel sem transbordamento');
  console.log('Página do aluno validada contra Next.js de produção e Supabase simulado. Nenhuma chamada de IA.');
} catch (error) { console.error(output); throw error; }
finally {
  await browser?.close();
  const ended = app.exitCode === null ? once(app, 'exit') : Promise.resolve();
  app.kill('SIGTERM'); await ended; await new Promise(resolve => provider.close(resolve));
}
