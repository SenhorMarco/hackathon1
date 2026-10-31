import "server-only";
import { db } from "@/lib/db/server";
import { ErroUpload, MAX_TOTAL, validarArquivos, validarConteudo, validarId } from "./validation";

export async function buscarProva(provaId: string) {
  validarId(provaId);
  const { data, error } = await db().from("provas").select("id, titulo, turma_id").eq("id", provaId).maybeSingle();
  if (error) throw new ErroUpload("Não foi possível consultar a prova.", 503);
  if (!data) throw new ErroUpload("Prova não encontrada.", 404);
  if (!data.turma_id) throw new ErroUpload("Associe a prova a uma turma antes de enviar as respostas.", 409);
  return data as { id: string; titulo: string; turma_id: string };
}

export async function lerFormulario(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) throw new ErroUpload("Envie um formulário com arquivos.");
  // Limita também requisições sem Content-Length antes de decodificar o multipart.
  const reader = request.body?.getReader();
  if (!reader) throw new ErroUpload("Formulário vazio.");
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    tamanho += value.byteLength;
    if (tamanho > MAX_TOTAL + 1024 * 1024) {
      await reader.cancel();
      throw new ErroUpload("O limite por aluno é 20 MiB.", 413);
    }
    partes.push(value);
  }
  let form: FormData;
  try {
    const corpo = new Uint8Array(tamanho);
    let posicao = 0;
    for (const parte of partes) { corpo.set(parte, posicao); posicao += parte.byteLength; }
    form = await new Response(corpo, { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new ErroUpload("Formulário inválido.");
  }
  const arquivos = form.getAll("arquivos");
  if (arquivos.some((arquivo) => !(arquivo instanceof File))) throw new ErroUpload("Arquivo inválido.");
  const paginas = arquivos as File[];
  validarArquivos(paginas);
  const imagens = await Promise.all(paginas.map(async (arquivo) => {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    validarConteudo(bytes, arquivo.type);
    return { arquivo, bytes };
  }));
  return { form, imagens };
}

export function respostaErro(erro: unknown) {
  if (erro instanceof ErroUpload) return Response.json({ erro: erro.message }, { status: erro.status });
  // Nunca expõe respostas da IA, nomes, chaves ou detalhes internos do banco.
  return Response.json({ erro: "Não foi possível concluir a operação. Tente novamente." }, { status: 503 });
}
