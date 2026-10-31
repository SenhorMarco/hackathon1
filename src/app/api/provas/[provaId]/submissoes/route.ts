import { db, BUCKET_PROVAS } from "@/lib/db/server";
import { buscarProva, lerFormulario, respostaErro } from "@/lib/uploads/server";
import { ErroUpload, validarId } from "@/lib/uploads/validation";

export async function POST(request: Request, context: RouteContext<"/api/provas/[provaId]/submissoes">) {
  const caminhos: string[] = [];
  try {
    const { provaId } = await context.params;
    const prova = await buscarProva(provaId);
    const { form, imagens } = await lerFormulario(request);
    const alunoId = validarId(String(form.get("alunoId") ?? ""));
    const submissaoId = validarId(String(form.get("submissaoId") ?? ""));
    const nome = form.get("nomeLido");
    if (nome !== null && (typeof nome !== "string" || nome.length > 200)) throw new ErroUpload("Nome lido inválido.");
    const cliente = db();
    const { data: aluno, error: erroAluno } = await cliente.from("alunos").select("id")
      .eq("id", alunoId).eq("turma_id", prova.turma_id).maybeSingle();
    if (erroAluno) throw new ErroUpload("Não foi possível consultar o aluno.", 503);
    if (!aluno) throw new ErroUpload("Selecione um aluno da turma desta prova.");

    // O mesmo ID permite repetir um envio cuja resposta se perdeu sem duplicar a submissão.
    const { data: existente, error: erroExistente } = await cliente.from("submissoes")
      .select("id, prova_id, aluno_id").eq("id", submissaoId).maybeSingle();
    if (erroExistente) throw new ErroUpload("Não foi possível consultar o envio.", 503);
    if (existente) {
      if (existente.prova_id !== provaId || existente.aluno_id !== alunoId) throw new ErroUpload("Este envio já foi associado a outro aluno.", 409);
      return Response.json({ id: existente.id }, { status: 200 });
    }

    // Um prefixo por tentativa impede que a limpeza de uma falha apague outro envio.
    const prefixo = `${provaId}/${submissaoId}/${crypto.randomUUID()}`;
    for (const [indice, { arquivo, bytes }] of imagens.entries()) {
      const extensao = arquivo.type === "image/jpeg" ? "jpg" : arquivo.type === "image/png" ? "png" : "webp";
      const caminho = `${prefixo}/${indice + 1}.${extensao}`;
      const { error } = await cliente.storage.from(BUCKET_PROVAS).upload(caminho, bytes, { contentType: arquivo.type, upsert: false });
      if (error) throw new ErroUpload("Falha ao armazenar as páginas. Tente enviar este aluno novamente.", 503);
      caminhos.push(caminho);
    }
    const { error } = await cliente.from("submissoes").insert({
      id: submissaoId, prova_id: provaId, aluno_id: alunoId,
      arquivo_paths: caminhos, status: "enviada", nome_lido: nome || null,
    });
    if (error) throw new ErroUpload("Falha ao registrar o envio. Tente enviar este aluno novamente.", 503);
    return Response.json({ id: submissaoId }, { status: 201 });
  } catch (erro) {
    if (caminhos.length) {
      try {
        const { error } = await db().storage.from(BUCKET_PROVAS).remove(caminhos);
        if (error) console.error("Falha na limpeza de arquivos de uma submissão não registrada.");
      } catch { console.error("Não foi possível limpar arquivos de uma submissão não registrada."); }
    }
    return respostaErro(erro);
  }
}
