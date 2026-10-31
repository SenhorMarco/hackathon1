"use client";

import { useState } from "react";
import { sugerirAluno, validarArquivos } from "@/lib/uploads/validation";

type Aluno = { id: string; nome: string };
type Estado = "pendente" | "lendo" | "enviando" | "enviada" | "erro";
type Item = {
  id: string;
  alunoId: string;
  arquivos: File[];
  estado: Estado;
  tentado?: boolean;
  nomeLido?: string | null;
  mensagem?: string;
};

async function requisitar(url: string, form: FormData): Promise<{ nomeLido?: string | null }> {
  const response = await fetch(url, { method: "POST", body: form });
  let resultado;
  try { resultado = await response.json(); }
  catch { throw new Error("O servidor não respondeu como esperado. Tente novamente."); }
  if (!response.ok) throw new Error(resultado.erro || "Não foi possível concluir a operação.");
  return resultado;
}

export function UploadLote({ provaId, titulo, alunos }: { provaId: string; titulo: string; alunos: Aluno[] }) {
  const [itens, setItens] = useState<Item[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [resumo, setResumo] = useState("");
  const endpoint = `/api/provas/${provaId}`;
  const atualizar = (id: string, alteracao: Partial<Item>) => {
    setItens((atuais) => atuais.map((item) => item.id === id ? { ...item, ...alteracao } : item));
  };
  const pendentes = itens.filter((item) => item.estado !== "enviada");
  const prontas = pendentes.length > 0 && pendentes.every((item) => item.alunoId && item.arquivos.length);

  async function lerNome(item: Item) {
    setOcupado(true);
    atualizar(item.id, { estado: "lendo", mensagem: undefined });
    try {
      const form = new FormData();
      form.append("arquivos", item.arquivos[0]);
      const { nomeLido } = await requisitar(`${endpoint}/sugerir-nome`, form);
      atualizar(item.id, { nomeLido: nomeLido ?? null, estado: "pendente" });
    } catch (erro) {
      atualizar(item.id, { estado: "pendente", mensagem: erro instanceof Error ? erro.message : "Falha ao ler o nome. Escolha o aluno manualmente." });
    } finally { setOcupado(false); }
  }

  async function enviarLote() {
    if (!prontas || ocupado) return;
    setOcupado(true);
    setResumo("");
    let enviadas = 0;
    let falhas = 0;
    // Envio sequencial limita memória e carga no servidor. Cada aluno tem seu resultado.
    for (const item of pendentes) {
      atualizar(item.id, { estado: "enviando", tentado: true, mensagem: undefined });
      try {
        validarArquivos(item.arquivos);
        const form = new FormData();
        form.append("alunoId", item.alunoId);
        form.append("submissaoId", item.id);
        if (item.nomeLido) form.append("nomeLido", item.nomeLido);
        for (const arquivo of item.arquivos) form.append("arquivos", arquivo);
        await requisitar(`${endpoint}/submissoes`, form);
        atualizar(item.id, { estado: "enviada", mensagem: undefined, arquivos: [] });
        enviadas++;
      } catch (erro) {
        atualizar(item.id, { estado: "erro", mensagem: erro instanceof Error ? erro.message : "Falha no envio. Tente novamente." });
        falhas++;
      }
    }
    setResumo(`${enviadas} prova(s) enviada(s). ${falhas} falha(s).${falhas ? " Os itens com falha podem ser reenviados." : ""}`);
    setOcupado(false);
  }

  return (
    <section className="space-y-5" aria-label="Envio de provas">
      <h2 className="text-xl font-medium">{titulo}</h2>
      <p>Adicione uma prova por aluno. Em cada item, selecione todas as páginas na ordem correta, começando pelo cabeçalho.</p>
      <p className="text-sm">PNG, JPEG ou WebP: até 10 páginas, 5 MiB por página e 20 MiB por aluno. PDF não é suportado nesta etapa.</p>
      <p className="text-sm">A IA apenas sugere o nome. Confira e selecione o aluno antes de enviar. A leitura é opcional e não impede o envio manual.</p>
      <div className="space-y-4">
        {itens.map((item, indice) => {
          const sugestaoId = sugerirAluno(item.nomeLido ?? null, alunos);
          const bloqueado = ocupado || item.estado === "enviada";
          return (
            <fieldset key={item.id} disabled={bloqueado} className="space-y-3 rounded-lg border border-zinc-400 p-4 disabled:opacity-75">
              <legend className="px-2 font-semibold">Prova do aluno {indice + 1}</legend>
              <label className="block space-y-1">
                <span>Páginas da prova</span>
                <input className="block w-full rounded border p-2" type="file" multiple disabled={item.tentado} accept="image/png,image/jpeg,image/webp" onChange={(event) => {
                  const arquivos = Array.from(event.target.files ?? []);
                  try {
                    validarArquivos(arquivos);
                    atualizar(item.id, { arquivos, estado: "pendente", nomeLido: undefined, mensagem: undefined });
                  } catch (erro) {
                    event.target.value = "";
                    atualizar(item.id, { arquivos: [], estado: "pendente", nomeLido: undefined, mensagem: erro instanceof Error ? erro.message : "Arquivos inválidos." });
                  }
                }} />
              </label>
              {item.arquivos.length > 0 && <ol className="list-inside list-decimal text-sm">{item.arquivos.map((arquivo, pagina) => <li key={pagina}>{arquivo.name}</li>)}</ol>}
              <button type="button" className="rounded border px-3 py-2 disabled:opacity-50" disabled={!item.arquivos.length || item.tentado} onClick={() => void lerNome(item)}>
                Sugerir nome com IA
              </button>
              {item.nomeLido !== undefined && <p>Nome lido pela IA: <strong>{item.nomeLido || "Não identificado"}</strong></p>}
              {sugestaoId && <button className="rounded border px-3 py-2" type="button" disabled={item.tentado} onClick={() => atualizar(item.id, { alunoId: sugestaoId })}>Selecionar aluno com esse nome</button>}
              <label className="block space-y-1">
                <span>Aluno da turma (confirme antes do envio)</span>
                <select required disabled={item.tentado} className="block w-full rounded border bg-background p-2" value={item.alunoId} onChange={(event) => atualizar(item.id, { alunoId: event.target.value })}>
                  <option value="">Selecione o aluno</option>
                  {alunos.map((aluno) => <option key={aluno.id} value={aluno.id}>{aluno.nome}</option>)}
                </select>
              </label>
              <button type="button" className="rounded border px-3 py-2" onClick={() => setItens((atuais) => atuais.filter((atual) => atual.id !== item.id))}>Remover do lote</button>
              <p role="status">{item.estado === "enviada" ? "Enviada e associada ao aluno selecionado." : item.estado === "enviando" ? "Enviando…" : item.estado === "lendo" ? "Lendo cabeçalho…" : "Aguardando envio."}</p>
              {item.mensagem && <p role="alert">{item.mensagem}</p>}
              {item.estado === "erro" && <p className="text-sm">Tente enviar novamente. Para trocar as páginas ou o aluno, remova este item e adicione outra prova.</p>}
            </fieldset>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={ocupado} className="rounded border px-4 py-2 disabled:opacity-50" onClick={() => {
          setItens((atuais) => [...atuais, { id: crypto.randomUUID(), alunoId: "", arquivos: [], estado: "pendente" }]);
          setResumo("");
        }}>Adicionar prova de aluno</button>
        <button type="button" disabled={ocupado || !prontas} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" onClick={() => void enviarLote()}>Confirmar alunos e enviar lote ({pendentes.length})</button>
      </div>
      {!prontas && pendentes.length > 0 && <p className="text-sm">Selecione as páginas e o aluno de cada item para habilitar o envio.</p>}
      <p role="status" aria-live="polite">{resumo}</p>
    </section>
  );
}
