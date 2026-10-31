import { test } from "node:test";
import assert from "node:assert/strict";
import { validarArquivos, validarConteudo, validarId, sugerirAluno, MAX_ARQUIVO } from "../src/lib/uploads/validation.ts";

test("aceita páginas válidas e rejeita lote vazio, excessivo, PDF e limites de tamanho", () => {
  const pagina = { type: "image/png", size: 100 };
  assert.doesNotThrow(() => validarArquivos([pagina]));
  for (const arquivos of [[], Array(11).fill(pagina), [{ type: "application/pdf", size: 100 }],
    [{ ...pagina, size: 0 }], [{ ...pagina, size: MAX_ARQUIVO + 1 }], Array(5).fill({ ...pagina, size: MAX_ARQUIVO })]) {
    assert.throws(() => validarArquivos(arquivos));
  }
  assert.doesNotThrow(() => validarArquivos(Array(4).fill({ ...pagina, size: MAX_ARQUIVO })));
});

test("confere assinatura real dos formatos e rejeita MIME forjado", () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const jpg = new Uint8Array([255, 216, 255, 224]);
  const webp = new TextEncoder().encode("RIFF0000WEBP");
  for (const [bytes, tipo] of [[png, "image/png"], [jpg, "image/jpeg"], [webp, "image/webp"]]) {
    assert.doesNotThrow(() => validarConteudo(bytes, tipo));
  }
  assert.throws(() => validarConteudo(png, "image/jpeg"));
  assert.throws(() => validarConteudo(new TextEncoder().encode("<script>"), "image/png"));
  assert.throws(() => validarConteudo(new Uint8Array(), "image/png"));
});

test("não usa nomes de arquivos como IDs ou caminhos", () => {
  assert.equal(validarId("12345678-1234-1234-1234-123456789abc"), "12345678-1234-1234-1234-123456789abc");
  for (const id of ["", "../../aluno", "123", "aluno.png"]) assert.throws(() => validarId(id));
});

test("sugestão exige nome completo e único, tolerando acentos e espaços", () => {
  const alunos = [{ id: "a", nome: "João Silva" }, { id: "b", nome: "Maria Souza" }];
  assert.equal(sugerirAluno(" JOAO   SILVA ", alunos), "a");
  assert.equal(sugerirAluno("João", alunos), null);
  assert.equal(sugerirAluno(null, alunos), null);
  assert.equal(sugerirAluno(" ", alunos), null);
  assert.equal(sugerirAluno("João Silva", [...alunos, { id: "c", nome: "Joao Silva" }]), null);
});
