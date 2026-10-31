// Execute com PLAYWRIGHT_MODULE apontando para playwright/index.mjs instalado.
// A suíte testar-upload.mjs pode chamar este fluxo contra os provedores simulados.
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
export async function testBrowserFlow(base) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const label = `Validação ${Date.now()}`;
    const studentName = 'Aluno de validação';
    await page.goto(`${base}/professor/provas`);
    await page.getByRole('button', { name: 'Nova turma', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Nome da turma').fill(label);
    await page.getByRole('dialog').getByRole('button', { name: 'Criar turma', exact: true }).click();
    await page.getByRole('button', { name: 'Alunos', exact: true }).click();
    await page.getByRole('button', { name: 'Cadastrar aluno', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Nome completo').fill(studentName);
    await page.getByRole('dialog').getByLabel('E-mail').fill('aluno-validacao@example.invalid');
    await page.getByRole('dialog').getByRole('button', { name: 'Cadastrar aluno', exact: true }).click();
    await page.getByRole('button', { name: /^Provas\s*\d*$/ }).click();
    await page.getByRole('button', { name: 'Nova prova', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Título da prova').fill(label);
    const canvas = createCanvas(800,1000);
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,1000);ctx.fillStyle='black';ctx.font='28px sans-serif';ctx.fillText('Questao 1: Quanto e 2 + 3?',40,160);
    const buffer=canvas.toBuffer('image/png');
    await page.getByLabel('Arquivo da prova').setInputFiles({name:'prova-validacao.png',mimeType:'image/png',buffer});
    const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/exams' && r.request().method()==='POST');
    await page.getByRole('button',{name:'Salvar prova',exact:true}).click();
    const response=await created;assert.ok(response.ok(),await response.text());
    const {prova}=await response.json();
    const analysisResponse=page.waitForResponse(r=>r.url().endsWith('/analyze')&&r.request().method()==='POST',{timeout:240000});
    await page.locator('.exam-editor').getByRole('button',{name:'Analisar prova',exact:true}).click();
    const analyzed=await analysisResponse;assert.ok(analyzed.ok(),await analyzed.text());
    await page.getByLabel(/^Enunciado/).first().waitFor({state:'visible',timeout:30000});
    assert.ok((await page.getByLabel(/^Enunciado/).first().inputValue()).length>0);
    await page.getByRole('button',{name:'Revisar baremas',exact:true}).click();
    const criterion=page.getByLabel('Critério',{exact:true}).first();await criterion.fill('Critério revisado pelo professor');
    await page.getByRole('button',{name:'Confirmar baremas',exact:true}).click();
    await page.getByRole('heading',{name:'Provas dos alunos',exact:true}).waitFor();
    await page.reload();
    // A página volta à lista, mas a turma e a prova continuam disponíveis.
    await page.getByRole('button',{name:new RegExp(label)}).first().click();
    await page.getByRole('button',{name:new RegExp(label)}).last().click();
    await page.getByRole('button',{name:'Baremas',exact:true}).click();
    assert.equal(await page.getByLabel('Critério',{exact:true}).first().inputValue(),'Critério revisado pelo professor');
    await page.getByRole('button',{name:'Respostas',exact:true}).click();
    ctx.fillText(`Nome: ${studentName}`,40,60);ctx.fillText('Resposta: 5',40,220);
    await page.getByLabel('Adicionar uma prova em imagens').setInputFiles({name:'aluno-validacao.png',mimeType:'image/png',buffer:canvas.toBuffer('image/png')});
    await page.getByRole('button',{name:/^Enviar 1 provas$/}).click();
    await page.getByRole('heading',{name:'1 provas recebidas',exact:true}).waitFor({timeout:120000});
    const choice=page.getByLabel('Aluno desta prova');
    await choice.waitFor();
    // Aguarda a leitura terminar para confirmar manualmente.
    await choice.selectOption({label:studentName},{timeout:120000});
    await page.getByRole('button',{name:'Confirmar aluno',exact:true}).click();
    await page.getByText(`Aluno confirmado: ${studentName}`,{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('Navegador: criar prova, ver análise, editar barema persistido e enviar/associar prova do aluno aprovados.');
    return prova.id;
  } finally { await browser.close(); }
}
if (process.argv[2]) await testBrowserFlow(process.argv[2]);
