// Supabase real, sem IA. Cria e mantém dados sintéticos identificáveis.
// Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.
// PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node scripts/testar-pagina-aluno-real.mjs https://seu-deploy --criar-dados-sinteticos
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const baseArg = process.argv[2];
if (!baseArg || !process.argv.includes('--criar-dados-sinteticos')) throw Error('Informe a URL e --criar-dados-sinteticos. Os registros de teste serão mantidos.');
const base = new URL(baseArg).origin;
process.loadEnvFile('.env.local');
const url = process.env.SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) throw Error('Configure as credenciais do banco em .env.local, sem compartilhá-las no chat.');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const client = createClient(url, key, { auth: { persistSession: false } });
const label = `VALIDACAO_LINK_ALUNO_${Date.now()}`;
const report = { label, base, startedAt: new Date().toISOString(), checks: [], aiCalls: 0, fixtures: [] };
const reportFile = process.env.REPORT_PATH || '/tmp/hackathon-student-page-real.json';
const save = () => writeFile(reportFile, JSON.stringify(report, null, 2), { mode: 0o600 });
async function insert(table, row) {
  const { error } = await client.from(table).insert(row);
  if (error) throw Error(`Falha ao gravar registro sintético em ${table} (${error.code || 'sem código'}).`);
}
const turmaId = crypto.randomUUID(); report.turmaId = turmaId;
await save();
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  await insert('turmas', { id: turmaId, nome: label });
  for (const [i, name] of ['A', 'B'].entries()) {
    const examId = crypto.randomUUID(), subId = crypto.randomUUID(), alunoId = crypto.randomUUID();
    const token = crypto.randomUUID().replaceAll('-', '');
    const grade = i === 0 ? 1.5 : 2;
    const fixture = { name, examId, subId, alunoId, token, grade }; report.fixtures.push(fixture); await save();
    const barema = { questoes: [{ numero: 1, valorTotal: 2, criterios: [{ id: 'q1', descricao: 'Critério sintético', pontos: 2 }] }] };
    await insert('alunos', { id: alunoId, turma_id: turmaId, nome: `${label} ALUNO ${name}` });
    await insert('provas', { id: examId, turma_id: turmaId, titulo: `${label} PROVA ${name}`, barema, status: i === 0 ? 'corrigindo' : 'corrigida' });
    await insert('submissoes', { id: subId, prova_id: examId, aluno_id: alunoId, status: 'corrigida' });
    await insert('respostas', { submissao_id: subId, prova_id: examId, numero: 1, correcao: { numero: 1, legivel: true, transcricao: 'Resposta sintética', descricaoMetodo: 'Sintético', passos: [], primeiroErro: null, criteriosAtendidos: ['q1'], notaSugerida: 0, justificativa: 'Fixture manual para testar a página, sem IA.' }, nota_final: grade, comentario_final: `${label} COMENTARIO ${name}` });
    await insert('feedbacks', { submissao_id: subId, token, publicado: i !== 0, conteudo: { resumo: `${label} RESUMO ${name}`, questoes: [{ numero: 1, acertos: 'Acerto sintético', erro: '', porque: '', dica: 'Revisar', exercicios: [{ enunciado: 'Quanto é 2 + 2?', resposta: '4' }] }], proximosPassos: ['Praticar'] } });
  }
  const [a, b] = report.fixtures;
  const context = await browser.newContext(); const page = await context.newPage();
  const other = await browser.newContext(); const otherPage = await other.newPage();
  async function unavailable(token) { await page.goto(`${base}/aluno/${token}`); await page.getByRole('heading', { name: 'Devolutiva indisponível' }).waitFor(); assert.ok(!(await page.locator('main').innerText()).includes(label)); }
  await unavailable('token-invalido'); await unavailable(crypto.randomUUID().replaceAll('-', '')); await unavailable(a.token);
  report.checks.push('Tokens inválidos, inexistentes e não publicados sem dados'); await save();
  const release = await fetch(`${base}/api/exams/${a.examId}/release`, { method: 'POST' }); assert.equal(release.status, 200);
  const { data: persisted, error } = await client.from('feedbacks').select('token,publicado').eq('submissao_id', a.subId).single(); assert.equal(error, null); assert.equal(persisted.token, a.token); assert.equal(persisted.publicado, true);
  for (const [fixture, target, forbidden] of [[a, page, b], [b, otherPage, a]]) {
    await target.goto(`${base}/aluno/${fixture.token}`);
    await target.getByRole('heading', { name: `${label} PROVA ${fixture.name}`, exact: true }).waitFor();
    await target.getByText(`${label} ALUNO ${fixture.name}`, { exact: true }).waitFor();
    await target.getByText(`${fixture.grade.toLocaleString('pt-BR')} / 2`, { exact: true }).waitFor();
    await target.getByText(`${label} COMENTARIO ${fixture.name}`, { exact: false }).waitFor();
    assert.ok(!(await target.locator('main').innerText()).includes(`${label} ALUNO ${forbidden.name}`));
    await target.reload(); await target.getByRole('heading', { name: `${label} PROVA ${fixture.name}` }).waitFor();
  }
  assert.deepEqual(await context.cookies(), []);
  report.checks.push('Liberação persistida com mesmo token; dois navegadores sem login, notas finais, comentários e recarga'); await save();
  const { error: revokeError } = await client.from('feedbacks').update({ publicado: false }).eq('submissao_id', a.subId); assert.equal(revokeError, null);
  await unavailable(a.token);
  report.checks.push('Retirada de publicação aplicada após visita anterior');
  // Restaura somente a fixture desta execução para permitir conferência manual.
  const again = await fetch(`${base}/api/exams/${a.examId}/release`, { method: 'POST' }); assert.equal(again.status, 200);
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${base}/aluno/${a.token}`); await page.getByRole('heading', { name: `${label} PROVA A` }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  report.status = 'passou'; report.completedAt = new Date().toISOString(); await save();
  console.log(`Página do aluno validada com Supabase real, sem IA. Relatório: ${reportFile}. Prefixo: ${label}.`);
} catch (error) { report.status = 'falhou'; report.error = error.message; await save(); throw error; }
finally { await browser?.close(); }
