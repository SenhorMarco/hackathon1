// Teste de ponta a ponta do fluxo com IA real, contra um servidor rodando.
// Cria uma turma, uma prova e duas respostas de alunos (imagens geradas),
// e passa por análise → correção → agrupamento → aprovação → devolutiva → liberação.
// Uso: npm run build && npx next start -p 3123   (em outro terminal)
//      npx tsx scripts/testar-fluxo-ia.mts [http://localhost:3123] [--manter]
// Sem --manter, apaga os dados de teste no fim.
import { createCanvas } from "@napi-rs/canvas";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const BASE = process.argv.find(a => a.startsWith("http")) || "http://localhost:3123";
const manter = process.argv.includes("--manter");
const supabase = createClient(process.env.SUPABASE_URL!.trim().replace(/\/rest\/v1\/?$/, ""), process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), { auth: { persistSession: false } });

function pagina(linhas: string[], fonte = "28px sans-serif"): Buffer {
  const canvas = createCanvas(1240, 160 + linhas.length * 52);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111"; ctx.font = fonte;
  linhas.forEach((l, i) => ctx.fillText(l, 60, 90 + i * 52));
  return canvas.toBuffer("image/png");
}

const prova = pagina([
  "Prova de Matemática — 1º ano",
  "Questão 1 (2 pontos): Resolva a equação 2x + 6 = 14.",
  "Questão 2 (3 pontos): Encontre as raízes de x² - 5x + 6 = 0.",
]);
const alunos = [
  { nome: "Ana Teste", linhas: ["Nome: Ana Teste", "Questão 1:", "2x = 14 - 6", "2x = 8", "x = 4", "Questão 2:", "Δ = 25 - 24 = 1", "x = (5 ± 1)/2", "x' = 3  e  x'' = 2"] },
  { nome: "Bruno Teste", linhas: ["Nome: Bruno Teste", "Questão 1:", "2x = 14 + 6", "2x = 20", "x = 10", "Questão 2:", "Soma = 5 e produto = 6", "Os números são 2 e 3", "x = 2 ou x = 3"] },
];

async function chamar(caminho: string, init?: RequestInit) {
  const inicio = Date.now();
  const r = await fetch(BASE + caminho, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  const corpo = await r.json().catch(() => ({}));
  console.log(`${r.ok ? "✓" : "✗"} ${init?.method || "GET"} ${caminho.replace(/[0-9a-f-]{36}/g, ":id")} → ${r.status} (${((Date.now() - inicio) / 1000).toFixed(1)}s)${r.ok ? "" : " " + corpo.error}`);
  if (!r.ok) throw new Error(corpo.error || r.statusText);
  return corpo;
}

const turmaId = crypto.randomUUID();
const provaId = crypto.randomUUID();
try {
  await supabase.from("turmas").insert({ id: turmaId, nome: "Turma de teste (IA)" }).throwOnError();
  await supabase.storage.from("provas").upload(`${provaId}/original.png`, prova, { contentType: "image/png" });
  await supabase.from("provas").insert({ id: provaId, turma_id: turmaId, titulo: "Teste automático do fluxo com IA", arquivo_path: `${provaId}/original.png`, arquivo_nome: "prova.png", status: "rascunho" }).throwOnError();

  const { prova: analisada } = await chamar(`/api/exams/${provaId}/analyze`, { method: "POST" });
  console.log(`  ${analisada.analise.questoes.length} questões; barema total ${analisada.barema.questoes.reduce((s: number, q: { valorTotal: number }) => s + q.valorTotal, 0)} pontos`);

  const subs: string[] = [];
  for (const a of alunos) {
    const { data: aluno } = await supabase.from("alunos").insert({ turma_id: turmaId, nome: a.nome }).select("id").single().throwOnError();
    const subId = crypto.randomUUID();
    const path = `${provaId}/submissoes/${subId}/1.png`;
    await supabase.storage.from("provas").upload(path, pagina(a.linhas, "30px serif"), { contentType: "image/png" });
    await supabase.from("submissoes").insert({ id: subId, prova_id: provaId, aluno_id: aluno!.id, arquivo_paths: [path], arquivo_nomes: [`${a.nome}.png`] }).throwOnError();
    subs.push(subId);
  }
  for (const s of subs) await chamar(`/api/exams/${provaId}/submissions/${s}/correct`, { method: "POST" });

  const numeros = analisada.barema.questoes.map((q: { numero: number }) => q.numero);
  for (const n of numeros) await chamar(`/api/exams/${provaId}/groups`, { method: "POST", body: JSON.stringify({ numero: n }) });

  const revisao = await chamar(`/api/exams/${provaId}/review`);
  for (const g of revisao.grupos) {
    console.log(`  Q${g.numero} · ${g.rotulo} [${g.categoria}] nota ${g.nota_sugerida} · ${revisao.respostas.filter((r: { grupo_id: string }) => r.grupo_id === g.id).length} resposta(s)`);
    await chamar(`/api/exams/${provaId}/groups/${g.id}`, { method: "PATCH", body: JSON.stringify({ nota: Number(g.nota_sugerida), comentario: g.comentario_sugerido }) });
  }
  for (const s of subs) await chamar(`/api/exams/${provaId}/submissions/${s}/feedback`, { method: "POST" });
  await chamar(`/api/exams/${provaId}/release`, { method: "POST" });

  const { data: fbs } = await supabase.from("feedbacks").select("token").in("submissao_id", subs);
  for (const f of fbs || []) {
    const r = await fetch(`${BASE}/aluno/${f.token}`);
    const html = await r.text();
    console.log(`${r.ok && html.includes("Questão") ? "✓" : "✗"} página do aluno /aluno/${f.token.slice(0, 6)}… → ${r.status}`);
  }
  console.log("\nFluxo completo.");
} finally {
  if (manter) console.log(`Dados mantidos: prova ${provaId}`);
  else {
    const { data: arquivos } = await supabase.from("submissoes").select("arquivo_paths").eq("prova_id", provaId);
    await supabase.storage.from("provas").remove([`${provaId}/original.png`, ...(arquivos || []).flatMap(a => a.arquivo_paths)]);
    await supabase.from("turmas").delete().eq("id", turmaId); // apaga provas, alunos e o resto em cascata
    await supabase.from("provas").delete().eq("id", provaId);
    console.log("Dados de teste removidos.");
  }
}
