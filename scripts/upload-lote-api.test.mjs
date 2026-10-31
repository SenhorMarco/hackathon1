// Testes da rota real, substituindo apenas a conexão externa com o Supabase.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const raiz = new URL("../", import.meta.url);
const provaId = "11111111-1111-1111-1111-111111111111";
const alunoId = "22222222-2222-2222-2222-222222222222";
const submissaoId = "33333333-3333-3333-3333-333333333333";
const outroId = "44444444-4444-4444-4444-444444444444";
const mockDb = "data:text/javascript,export const BUCKET_PROVAS='provas'; export const db=()=>globalThis.__uploadTestDb;";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
    if (specifier === "@/lib/db/server") return { url: mockDb, shortCircuit: true };
    if (specifier === "@/lib/ai/client") return {
      url: "data:text/javascript,export const MODELO='modelo-teste'; export const ia=()=>globalThis.__uploadTestIa;", shortCircuit: true,
    };
    if (specifier === "@/lib/ai/json") return { url: new URL("src/lib/ai/json.ts", raiz).href, shortCircuit: true };
    if (specifier === "@/lib/uploads/server") return { url: new URL("src/lib/uploads/server.ts", raiz).href, shortCircuit: true };
    if (specifier === "@/lib/uploads/validation" || specifier === "./validation") {
      return { url: new URL("src/lib/uploads/validation.ts", raiz).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { POST } = await import("../src/app/api/provas/[provaId]/submissoes/route.ts");
const { POST: sugerirNome } = await import("../src/app/api/provas/[provaId]/sugerir-nome/route.ts");

function preparar({ falhaUpload = 0, falhaInsert = false, existente = null } = {}) {
  const gravados = [];
  const removidos = [];
  const inseridos = [];
  let uploads = 0;
  globalThis.__uploadTestDb = {
    from(tabela) {
      const filtros = {};
      return {
        select() { return this; },
        eq(chave, valor) { filtros[chave] = valor; return this; },
        async maybeSingle() {
          if (tabela === "provas") return { data: { id: provaId, titulo: "Prova teste", turma_id: "turma" }, error: null };
          if (tabela === "alunos") return { data: filtros.id === alunoId && filtros.turma_id === "turma" ? { id: alunoId } : null, error: null };
          return { data: existente, error: null };
        },
        async insert(linha) {
          if (falhaInsert) return { error: { message: "detalhe privado do banco" } };
          inseridos.push(linha);
          return { error: null };
        },
      };
    },
    storage: { from(bucket) {
      assert.equal(bucket, "provas");
      return {
        async upload(caminho, bytes, options) {
          uploads++;
          if (uploads === falhaUpload) return { error: {} };
          gravados.push(caminho);
          assert.equal(options.upsert, false);
          assert.ok(bytes.length > 0);
          return { error: null };
        },
        async remove(caminhos) { removidos.push(...caminhos); return { error: null }; },
      };
    } },
  };
  return { gravados, removidos, inseridos };
}

function pedido({ aluno = alunoId, paginas = 2 } = {}) {
  const form = new FormData();
  form.set("alunoId", aluno);
  form.set("submissaoId", submissaoId);
  form.set("nomeLido", "Nome fictício");
  for (let i = 0; i < paginas; i++) {
    form.append("arquivos", new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, i])], { type: "image/png" }), `pagina-${i}.png`);
  }
  return new Request("http://localhost/api/teste", { method: "POST", body: form });
}
const contexto = { params: Promise.resolve({ provaId }) };

test("grava todas as páginas em ordem e associa ao aluno confirmado", async () => {
  const estado = preparar();
  const resposta = await POST(pedido(), contexto);
  assert.equal(resposta.status, 201);
  assert.deepEqual(await resposta.json(), { id: submissaoId });
  assert.equal(estado.inseridos.length, 1);
  const linha = estado.inseridos[0];
  assert.equal(linha.aluno_id, alunoId);
  assert.equal(linha.prova_id, provaId);
  assert.equal(linha.status, "enviada");
  assert.equal(linha.nome_lido, "Nome fictício");
  assert.deepEqual(linha.arquivo_paths, estado.gravados);
  assert.ok(linha.arquivo_paths[0].endsWith("/1.png"));
  assert.ok(linha.arquivo_paths[1].endsWith("/2.png"));
  assert.equal(estado.removidos.length, 0);
});

test("rejeita aluno de outra turma antes de armazenar páginas", async () => {
  const estado = preparar();
  assert.equal((await POST(pedido({ aluno: outroId }), contexto)).status, 400);
  assert.equal(estado.gravados.length, 0);
  assert.equal(estado.inseridos.length, 0);
});

test("limpa páginas parciais se o storage falhar", async () => {
  const estado = preparar({ falhaUpload: 2 });
  assert.equal((await POST(pedido(), contexto)).status, 503);
  assert.equal(estado.gravados.length, 1);
  assert.deepEqual(estado.removidos, estado.gravados);
  assert.equal(estado.inseridos.length, 0);
});

test("limpa todas as páginas se o insert falhar e não vaza detalhes", async () => {
  const estado = preparar({ falhaInsert: true });
  const resposta = await POST(pedido(), contexto);
  assert.equal(resposta.status, 503);
  assert.equal(estado.gravados.length, 2);
  assert.deepEqual(estado.removidos, estado.gravados);
  assert.doesNotMatch(JSON.stringify(await resposta.json()), /detalhe privado/);
});

test("repetir um envio já registrado não duplica arquivos nem submissão", async () => {
  const estado = preparar({ existente: { id: submissaoId, prova_id: provaId, aluno_id: alunoId } });
  assert.equal((await POST(pedido(), contexto)).status, 200);
  assert.equal(estado.gravados.length, 0);
  assert.equal(estado.inseridos.length, 0);
});

test("não reaproveita um identificador registrado para outro aluno", async () => {
  const estado = preparar({ existente: { id: submissaoId, prova_id: provaId, aluno_id: outroId } });
  assert.equal((await POST(pedido(), contexto)).status, 409);
  assert.equal(estado.gravados.length, 0);
});

test("recusa formulários inválidos e não permite lote sem páginas", async () => {
  preparar();
  assert.equal((await POST(pedido({ paginas: 0 }), contexto)).status, 400);
  const request = new Request("http://localhost", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  assert.equal((await POST(request, contexto)).status, 400);
});

test("rejeita conteúdo falsificado antes de persistir", async () => {
  const estado = preparar();
  const form = new FormData();
  form.append("arquivos", new Blob(["texto, não uma imagem"], { type: "image/png" }), "falsa.png");
  const request = new Request("http://localhost", { method: "POST", body: form });
  assert.equal((await POST(request, contexto)).status, 400);
  assert.equal(estado.gravados.length, 0);
});

test("limita o corpo mesmo sem Content-Length", async () => {
  const estado = preparar();
  const request = new Request("http://localhost", {
    method: "POST", headers: { "content-type": "multipart/form-data; boundary=teste" },
    body: new Uint8Array(22 * 1024 * 1024),
  });
  assert.equal(request.headers.get("content-length"), null);
  assert.equal((await POST(request, contexto)).status, 413);
  assert.equal(estado.gravados.length, 0);
});

test("leitura do cabeçalho valida o JSON da IA e não persiste arquivos", async () => {
  const estado = preparar();
  globalThis.__uploadTestIa = { chat: { completions: { async create(entrada) {
    assert.equal(entrada.model, "modelo-teste");
    assert.equal(entrada.messages[1].content.length, 2);
    assert.match(entrada.messages[1].content[1].image_url.url, /^data:image\/png;base64,/);
    return { choices: [{ message: { content: '{"nomeLido":" Aluno Fictício "}' } }] };
  } } } };
  const resposta = await sugerirNome(pedido({ paginas: 1 }), contexto);
  assert.equal(resposta.status, 200);
  assert.deepEqual(await resposta.json(), { nomeLido: "Aluno Fictício" });
  assert.equal(estado.gravados.length, 0);
  assert.equal(estado.inseridos.length, 0);
});

test("cabeçalho sem nome é uma sugestão nula, não um erro", async () => {
  preparar();
  globalThis.__uploadTestIa = { chat: { completions: { async create() {
    return { choices: [{ message: { content: '{"nomeLido":null}' } }] };
  } } } };
  const resposta = await sugerirNome(pedido({ paginas: 1 }), contexto);
  assert.equal(resposta.status, 200);
  assert.deepEqual(await resposta.json(), { nomeLido: null });
});

test("erro da IA é sanitizado e não impede um upload manual posterior", async () => {
  const estado = preparar();
  globalThis.__uploadTestIa = { chat: { completions: { async create() {
    throw new Error("chave e dados privados");
  } } } };
  const resposta = await sugerirNome(pedido({ paginas: 1 }), contexto);
  assert.equal(resposta.status, 503);
  assert.doesNotMatch(JSON.stringify(await resposta.json()), /chave|privados/);
  assert.equal((await POST(pedido(), contexto)).status, 201);
  assert.equal(estado.inseridos.length, 1);
});

test("leitura de nome rejeita envio com mais de uma página", async () => {
  preparar();
  assert.equal((await sugerirNome(pedido(), contexto)).status, 400);
});
