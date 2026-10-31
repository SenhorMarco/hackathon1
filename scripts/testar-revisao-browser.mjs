// Componentes reais com API simulada. Não usa contas, arquivos nem IA de produção.
// Configure ESBUILD_MODULE e PLAYWRIGHT_MODULE se não estiverem no node_modules.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
const { build } = await import(process.env.ESBUILD_MODULE || 'esbuild');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Review from './src/components/correction-review'; createRoot(document.getElementById('root')).render(<Review examId="test" resultsOnly={location.search.includes('results')}/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const css = (await readFile('src/app/globals.css', 'utf8')).replace(/@import[^;]+;/g, '');
const correction = (numero, legivel = true) => ({ numero, legivel, transcricao: 'v = Δs / Δt = 120 / 10 = 12 m/s', passos: [{ descricao: 'Relaciona distância e tempo', correto: true, comentario: 'Relação fundamentada.' }], metodo: 'padrao', descricaoMetodo: 'Usa a velocidade média.', notaSugerida: 1.5, justificativa: 'Estratégia adequada. Confira a unidade.' });
const answer = (id, sub, numero, legivel = true) => ({ id, submissao_id: sub, numero, nota_final: null, comentario_final: null, grupo_id: numero === 2 ? 'group' : null, correcao: correction(numero, legivel) });
const state = {
  status: 'corrigindo', analise: null,
  barema: { questoes: [1, 2].map(numero => ({ numero, valorTotal: 2, criterios: [{ id: 'c', descricao: 'Relacionar e justificar', pontos: 2 }] })) },
  submissoes: ['s1', 's2'].map((id, i) => ({ id, aluno_id: `a${i + 1}`, status: 'corrigida', arquivo_paths: ['test.png'], arquivo_nomes: ['Prova respondida.png'] })),
  alunos: [{ id: 'a1', nome: 'Ana Silva' }, { id: 'a2', nome: 'Bruno Costa' }],
  respostas: [answer('r1', 's1', 2), answer('r2', 's2', 2, false)],
  grupos: [{ id: 'group', numero: 2, rotulo: 'Velocidade média' }], feedbacks: [],
};
const feedbackContent = (resumo) => ({ resumo, questoes: [1, 2].map(numero => ({ numero, acertos: 'Relacionou distância e tempo.', erro: '', porque: '', dica: 'Confira as unidades.', exercicios: [{ enunciado: 'Calcule a velocidade para 60 m em 5 s.', resposta: '12 m/s' }] })), proximosPassos: ['Pratique a conversão de unidades.'] });
const feedbackBySubmission = new Map();
let failLoad = false;
const patches = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (url.pathname.endsWith('/review')) {
    if (failLoad) { failLoad = false; return send(503, { error: 'Falha simulada. Tente novamente.' }); }
    return send(200, state);
  }
  const feedbackMatch = url.pathname.match(/^\/api\/exams\/[^/]+\/submissions\/([^/]+)\/feedback$/);
  if (feedbackMatch) {
    const submissionId = feedbackMatch[1];
    const existing = feedbackBySubmission.get(submissionId) ?? { conteudo: feedbackContent(`Devolutiva de ${submissionId}.`), revisao: 'a'.repeat(64), revisado: false, publicado: false };
    if (req.method === 'GET') return send(200, { feedback: existing });
    if (req.method === 'PUT') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks));
      existing.conteudo = body.conteudo;
      existing.revisado = true;
      feedbackBySubmission.set(submissionId, existing);
      const row = state.feedbacks.find(f => f.submissao_id === submissionId);
      if (row) row.revisado = true;
      return send(200, { feedback: existing });
    }
  }
  if (url.pathname.includes('/answers/')) {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks)); patches.push(body);
    const row = state.respostas.find(r => r.id === url.pathname.split('/').at(-1));
    row.nota_final = body.nota; row.comentario_final = body.comentario;
    state.feedbacks = state.feedbacks.filter(f => f.submissao_id !== row.submissao_id);
    return send(200, { resposta: row });
  }
  if (url.pathname.endsWith('/release')) { state.status = 'corrigida'; state.feedbacks.forEach(f => { f.publicado = true; }); return send(200, {}); }
  if (url.pathname === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(output.outputFiles[0].text); }
  if (url.pathname === '/style.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css); }
  res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><main style="max-width:1080px;margin:24px auto;padding:16px" id="root"></main><script src="/app.js"></script></body></html>');
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.getByRole('heading', { name: 'Ainda não há respostas para esta questão' }).waitFor();
  await page.getByLabel('Questão', { exact: true }).selectOption('2');
  assert.equal(await page.getByRole('article').count(), 2, 'navega mesmo quando a primeira questão não tem respostas');
  assert.equal(await page.getByRole('button', { name: 'Aprovar grupo', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Liberar resultados aos alunos' }).isDisabled(), true);
  const ana = page.getByRole('article', { name: 'Resposta de Ana Silva, Q2' });
  await ana.getByLabel('Nota final', { exact: false }).fill('');
  await ana.getByRole('button', { name: 'Validar resposta' }).click();
  await page.getByRole('alert').filter({ hasText: 'Informe uma nota entre' }).waitFor();
  assert.equal(patches.length, 0, 'campo vazio não vira zero');
  await ana.getByLabel('Nota final', { exact: false }).fill('3');
  await ana.getByRole('button', { name: 'Validar resposta' }).click();
  await page.getByRole('alert').filter({ hasText: 'Informe uma nota entre' }).waitFor();
  assert.equal(patches.length, 0);
  await ana.getByLabel('Nota final', { exact: false }).fill('1,75');
  await ana.getByLabel('Feedback ao aluno').fill('Você justificou o cálculo. Confira a unidade.');
  await ana.getByRole('button', { name: 'Validar resposta' }).click();
  await ana.getByText('Validada', { exact: true }).waitFor();
  assert.equal(state.respostas[0].nota_final, 1.75);
  assert.equal(state.respostas[1].nota_final, null);
  const bruno = page.getByRole('article', { name: 'Resposta de Bruno Costa, Q2' });
  assert.equal(await bruno.getByLabel('Nota final', { exact: false }).inputValue(), '');
  await bruno.getByLabel('Nota final', { exact: false }).fill('1');
  await bruno.getByRole('button', { name: 'Validar resposta' }).click();
  await page.getByRole('alert').filter({ hasText: 'Confira a resposta no arquivo' }).waitFor();
  await bruno.getByRole('checkbox').check();
  await bruno.getByRole('button', { name: 'Validar resposta' }).click();
  await bruno.getByText('Validada', { exact: true }).waitFor();
  await page.getByLabel('Somente pendentes').check();
  await page.getByRole('heading', { name: 'Nenhuma resposta neste filtro' }).waitFor();
  await page.getByLabel('Somente pendentes').uncheck();
  await mkdir('tmp/review-qa', { recursive: true });
  await page.screenshot({ path: 'tmp/review-qa/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'tmp/review-qa/mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sem rolagem horizontal no celular');
  await page.goto(base + '?results');
  await page.getByRole('table').waitFor();
  assert.match(await page.getByRole('table').innerText(), /Pendente/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar notas validadas' }).click();
  assert.equal((await download).suggestedFilename(), 'notas-test.csv');
  state.respostas.push(...['s1', 's2'].map((sub, i) => ({ ...answer(`q1-${sub}`, sub, 1), nota_final: i + 1, comentario_final: 'Validado individualmente.' })));
  state.feedbacks = ['s1', 's2'].map(submissao_id => ({ submissao_id, token: submissao_id, publicado: false, atualizado: true, revisado: false }));
  await page.reload();
  const releaseButton = page.getByRole('button', { name: 'Liberar resultados aos alunos' });
  assert.equal(await releaseButton.isDisabled(), true, 'devolutivas atualizadas precisam de revisão do professor');
  const anaEditor = page.getByRole('button', { name: 'Revisar devolutiva de Ana Silva' });
  await anaEditor.click();
  const summary = page.getByLabel('Resumo da devolutiva');
  await summary.waitFor();
  assert.equal(await page.getByLabel(/revisão|versão técnica|hash/i).count(), 0, 'a versão técnica não é editável');
  await summary.fill('Ana, sua resolução está bem encaminhada.');
  await page.getByRole('button', { name: 'Aprovar texto da devolutiva' }).click();
  await page.getByRole('button', { name: 'Revisar devolutiva de Bruno Costa' }).click();
  await page.getByLabel('Resumo da devolutiva').waitFor();
  await page.getByLabel('Resumo da devolutiva').fill('Bruno, revise as unidades no cálculo.');
  await page.getByRole('button', { name: 'Aprovar texto da devolutiva' }).click();
  assert.equal(feedbackBySubmission.get('s1').revisado, true);
  assert.equal(feedbackBySubmission.get('s1').conteudo.resumo, 'Ana, sua resolução está bem encaminhada.', 'o PUT preserva a edição de Ana');
  assert.equal(feedbackBySubmission.get('s1').revisao, 'a'.repeat(64), 'o hash de concorrência permanece inalterado');
  assert.equal(feedbackBySubmission.get('s2').conteudo.resumo, 'Bruno, revise as unidades no cálculo.', 'o PUT preserva a edição de Bruno');
  await page.getByRole('button', { name: 'Liberar resultados aos alunos' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Liberar resultados aos alunos' }).isDisabled(), false, 'liberação habilita após aprovar ambos os textos');
  await page.getByRole('button', { name: 'Liberar resultados aos alunos' }).click();
  await page.getByText('Resultados liberados', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Abrir devolutiva' }).count(), 2);
  await page.goto(base); await page.getByLabel('Questão', { exact: true }).selectOption('2');
  assert.equal(await page.getByRole('article').count(), 2, 'respostas continuam acessíveis depois da liberação');
  assert.equal(await page.getByRole('button', { name: 'Validar resposta' }).count(), 0);
  failLoad = true; await page.reload();
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await page.getByLabel('Questão', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('OK: navegador desktop/mobile, navegação sem respostas, revisão individual, nota vazia/teto, leitura incerta, filtros, resultados, CSV, liberação e recuperação de erro.');
} finally { await browser.close(); server.closeAllConnections(); server.close(); }
