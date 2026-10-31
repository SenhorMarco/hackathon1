'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { enviarArquivos, removerQuestao, validarSelecao } from '@/lib/aluno/envio-cliente';
import { PROVA_ACCEPT } from '@/lib/uploads/validation';
import styles from './aluno-portal.module.css';

type Arquivo = { index: number; nome: string };
export type QuestaoParaEnvio = {
  numero: number; enunciado: string; conteudo: string; valor: number | null; fotos: Arquivo[];
  /** Nota e comentário validados pelo professor, visíveis assim que a questão é corrigida. */
  correcao: { nota: number; comentario: string } | null;
};

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const quando = (iso: string | null, hora = false) => iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  .toLocaleString('pt-BR', hora ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'long' }) : null;

/** Seleção e envio de arquivos: usado por questão e para a prova inteira. */
function Envio({ provaId, numero, temEnvio, desabilitado, rotulo }: { provaId: string; numero?: number; temEnvio: boolean; desabilitado: boolean; rotulo: string }) {
  const router = useRouter();
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erro, setErro] = useState('');
  const [status, setStatus] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function enviar() {
    if (!arquivos.length || ocupado) return;
    setOcupado(true); setErro('');
    try {
      await enviarArquivos(provaId, arquivos, setStatus, numero);
      setArquivos([]);
      setStatus(temEnvio ? 'Foto substituída.' : 'Enviado! Seu professor já recebeu.');
      router.refresh();
    } catch (e) { setStatus(''); setErro(e instanceof Error ? e.message : 'Falha no envio.'); }
    finally { setOcupado(false); }
  }

  return <div className={styles.upload}>
    <label className={styles.arquivo}>
      <input type="file" accept={PROVA_ACCEPT} multiple disabled={desabilitado || ocupado}
        onChange={e => { const lista = Array.from(e.target.files || []); e.target.value = ''; const msg = validarSelecao(lista); setErro(msg || ''); setStatus(''); setArquivos(msg ? [] : lista); }} />
      <strong>{arquivos.length ? arquivos.map(f => f.name).join(', ') : rotulo}</strong>
      <small>{numero !== undefined ? 'Tire uma foto nítida da resposta. Se ocupar mais de uma folha, selecione todas.' : 'Um PDF ou até dez fotos das páginas, em ordem.'}</small>
    </label>
    {arquivos.length > 0 && <button className={styles.botao} disabled={ocupado} onClick={enviar}>{ocupado ? 'Enviando…' : temEnvio ? 'Substituir' : 'Enviar'}</button>}
    {status && <p className={styles.ok} role="status">{status}</p>}
    {erro && <p className={styles.erro} role="alert">{erro}</p>}
  </div>;
}

function CartaoQuestao({ provaId, questao, aceitaEnvio }: { provaId: string; questao: QuestaoParaEnvio; aceitaEnvio: boolean }) {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [erro, setErro] = useState('');
  const [removendo, setRemovendo] = useState(false);
  const enviada = questao.fotos.length > 0;

  async function remover() {
    setRemovendo(true); setErro('');
    try { await removerQuestao(provaId, questao.numero); router.refresh(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível remover.'); }
    finally { setRemovendo(false); }
  }

  return <article className={styles.prova}>
    <div className={styles.provaTopo}>
      <div>
        <h3>Questão {questao.numero}{questao.valor !== null && <span className={styles.muted}> · {fmt(questao.valor)} pt</span>}</h3>
        <p className={styles.muted}>{questao.conteudo}</p>
      </div>
      {questao.correcao
        ? <span className={`${styles.badge} ${styles.green}`}>Corrigida</span>
        : <span className={`${styles.badge} ${enviada ? styles.green : styles.amber}`}>{enviada ? `${questao.fotos.length} foto${questao.fotos.length > 1 ? 's' : ''}` : 'Sem foto'}</span>}
    </div>
    {questao.correcao && <div className={styles.nota}>
      <strong>{fmt(questao.correcao.nota)}{questao.valor !== null && <span> / {fmt(questao.valor)}</span>}</strong>
      <p><b>Comentário do professor:</b> {questao.correcao.comentario}</p>
    </div>}
    <button className={styles.linkTexto} onClick={() => setAberta(!aberta)}>{aberta ? 'Ocultar enunciado' : 'Ver enunciado'}</button>
    {aberta && <p className={styles.enunciado}>{questao.enunciado}</p>}
    {enviada && <ul className={styles.fotos}>{questao.fotos.map(f => <li key={f.index}>
      <a href={`/api/aluno/provas/${provaId}/arquivo?index=${f.index}`} target="_blank" rel="noopener noreferrer">{f.nome}</a>
    </li>)}</ul>}
    {aceitaEnvio && <Envio provaId={provaId} numero={questao.numero} temEnvio={enviada} desabilitado={removendo} rotulo={enviada ? 'Escolher outra foto para substituir' : 'Escolher foto da resposta'} />}
    {aceitaEnvio && enviada && <button className={styles.linkTexto} disabled={removendo} onClick={remover}>{removendo ? 'Removendo…' : 'Remover foto desta questão'}</button>}
    {erro && <p className={styles.erro} role="alert">{erro}</p>}
  </article>;
}

export default function AlunoProva({ prova, aceitaEnvio, questoes, arquivosInteiros, emCorrecao, devolutiva }: {
  prova: { id: string; titulo: string; data: string | null; prazo: string | null };
  aceitaEnvio: boolean;
  questoes: QuestaoParaEnvio[];
  arquivosInteiros: Arquivo[];
  emCorrecao: boolean;
  devolutiva: string | null;
}) {
  const respondidas = questoes.filter(q => q.fotos.length).length;
  const total = questoes.reduce((s, q) => s + (q.valor ?? 0), 0);
  const corrigidas = questoes.filter(q => q.correcao);
  const pontos = corrigidas.reduce((s, q) => s + q.correcao!.nota, 0);
  const possiveis = corrigidas.reduce((s, q) => s + (q.valor ?? 0), 0);

  return <main className={styles.page}>
    <Link href="/aluno" className={styles.voltar}>← Minhas provas</Link>
    <header className={styles.header}>
      <p className={styles.eyebrow}>PROVA</p>
      <h1>{prova.titulo}</h1>
      <p className={styles.muted}>
        {prova.data && <>Aplicada em {quando(prova.data)}</>}
        {prova.prazo && <> · Envio até {quando(prova.prazo, true)}</>}
        {total > 0 && <> · {fmt(total)} pontos</>}
      </p>
    </header>

    {devolutiva && <section className={styles.vazio}><h2>Sua correção foi liberada.</h2><p><Link className={styles.botao} href={`/aluno/${devolutiva}`}>Ver minha nota e devolutiva</Link></p></section>}
    {!aceitaEnvio && !devolutiva && <section className={styles.vazio}><p>Esta prova não está mais recebendo envios.</p></section>}
    {aceitaEnvio && emCorrecao && <section className={styles.vazio}><p>Seu professor já começou a corrigir. Se você trocar uma foto agora, a correção da sua prova será refeita.</p></section>}

    {questoes.length > 0 ? <>
      <section className={styles.resumo}>
        <div><small>QUESTÕES COM FOTO</small><strong>{respondidas} de {questoes.length}</strong></div>
        <div><small>SITUAÇÃO</small><strong>{devolutiva ? 'Corrigida' : emCorrecao ? 'Em correção' : respondidas === questoes.length ? 'Tudo enviado' : respondidas ? 'Envio parcial' : 'Envio pendente'}</strong></div>
        <div><small>QUESTÕES CORRIGIDAS</small><strong>{corrigidas.length} de {questoes.length}</strong></div>
        <div><small>{corrigidas.length === questoes.length ? 'NOTA' : 'NOTA ATÉ AGORA'}</small><strong>{corrigidas.length ? `${fmt(pontos)} / ${fmt(possiveis)}` : '—'}</strong></div>
      </section>
      {corrigidas.length > 0 && corrigidas.length < questoes.length && <p className={styles.muted}>O professor está corrigindo questão por questão. A nota até agora considera só as questões já corrigidas.</p>}
      {arquivosInteiros.length > 0 && <p className={styles.muted}>Você tinha enviado a prova inteira ({arquivosInteiros.map(a => a.nome).join(', ')}). Ao enviar a foto de uma questão, esse envio é substituído pelas fotos por questão.</p>}
      <section className={styles.grupo}>
        <h2>Envie a foto de cada resposta <span className={styles.contagem}>{questoes.length}</span></h2>
        {questoes.map(q => <CartaoQuestao key={q.numero} provaId={prova.id} questao={q} aceitaEnvio={aceitaEnvio} />)}
      </section>
    </> : <section className={styles.grupo}>
      <h2>Envie sua prova</h2>
      <p className={styles.muted}>O professor ainda está preparando as questões desta prova. Por enquanto, envie a prova inteira; depois, esta página vai mostrar o envio questão por questão.</p>
      {arquivosInteiros.length > 0 && <ul className={styles.fotos}>{arquivosInteiros.map(a => <li key={a.index}><a href={`/api/aluno/provas/${prova.id}/arquivo?index=${a.index}`} target="_blank" rel="noopener noreferrer">{a.nome}</a></li>)}</ul>}
      {aceitaEnvio && <article className={styles.prova}><Envio provaId={prova.id} temEnvio={arquivosInteiros.length > 0} desabilitado={false} rotulo={arquivosInteiros.length ? 'Escolher arquivo para substituir o envio' : 'Escolher arquivo da prova'} /></article>}
    </section>}
  </main>;
}
