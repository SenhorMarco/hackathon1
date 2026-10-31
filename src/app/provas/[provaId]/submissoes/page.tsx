import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db/server";
import { buscarProva } from "@/lib/uploads/server";
import { ErroUpload } from "@/lib/uploads/validation";
import { UploadLote } from "@/components/upload-lote";

export default function Pagina(props: PageProps<"/provas/[provaId]/submissoes">) {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <h1 className="text-3xl font-semibold">Upload em lote das provas dos alunos</h1>
      <Suspense fallback={<p role="status">Carregando prova e alunos…</p>}>
        <DadosDaProva params={props.params} />
      </Suspense>
    </main>
  );
}

async function DadosDaProva({ params }: { params: Promise<{ provaId: string }> }) {
  await connection();
  const { provaId } = await params;
  const dados = await carregarDados(provaId);
  if ("erro" in dados) return <p role="alert">{dados.erro}</p>;
  if (!dados.alunos.length) return <p role="status">Cadastre alunos na turma desta prova antes de enviar as respostas.</p>;
  return <UploadLote provaId={provaId} titulo={dados.prova.titulo} alunos={dados.alunos} />;
}

async function carregarDados(provaId: string) {
  try {
    const prova = await buscarProva(provaId);
    const { data: alunos, error } = await db().from("alunos").select("id, nome")
      .eq("turma_id", prova.turma_id).order("nome");
    if (error) throw new ErroUpload("Não foi possível carregar os alunos. Recarregue a página.", 503);
    return { prova, alunos: alunos ?? [] };
  } catch (erro) {
    return { erro: erro instanceof ErroUpload ? erro.message : "Não foi possível carregar a prova. Confira a configuração do Supabase e tente novamente." };
  }
}
