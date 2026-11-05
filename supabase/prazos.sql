-- Executar depois de schema.sql e contas.sql. Reaplicável, sem remover dados existentes.
begin;
alter table public.provas add column if not exists prazo_envio timestamptz;
alter table public.provas add column if not exists excecoes_envio jsonb not null default '{}'::jsonb;

-- A conferência e a troca de arquivos são uma transação, serializada com a edição do prazo.
create or replace function public.confirmar_envio_aluno(
  p_prova uuid, p_aluno uuid, p_envio uuid, p_anteriores text[],
  p_paths text[], p_nomes text[], p_nome text, p_remover boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_prova public.provas%rowtype;
  v_envio public.submissoes%rowtype;
  v_prazo timestamptz;
begin
  select * into v_prova from public.provas where id = p_prova for update;
  if not found or not exists(select 1 from public.alunos where id = p_aluno and turma_id = v_prova.turma_id) then
    raise exception 'Envio não autorizado' using errcode = 'P0001';
  end if;
  v_prazo := v_prova.prazo_envio;
  if v_prazo is not null and v_prova.excecoes_envio ? p_aluno::text then
    v_prazo := greatest(v_prazo, (v_prova.excecoes_envio ->> p_aluno::text)::timestamptz);
  end if;
  if v_prova.status not in ('rascunho','analisada','barema_pronto','corrigindo')
     or (v_prazo is not null and v_prazo <= clock_timestamp()) then
    raise exception 'Prazo encerrado ou prova publicada' using errcode = 'P0001';
  end if;
  select * into v_envio from public.submissoes where prova_id = p_prova and aluno_id = p_aluno order by created_at desc limit 1 for update;
  if found then
    if v_envio.id <> p_envio or v_envio.arquivo_paths is distinct from p_anteriores then
      raise exception 'O envio mudou. Recarregue a página.' using errcode = 'P0001';
    end if;
    delete from public.feedbacks where submissao_id = p_envio;
    delete from public.respostas where submissao_id = p_envio;
    if p_remover then
      delete from public.submissoes where id = p_envio;
      return null;
    end if;
    update public.submissoes set arquivo_paths = p_paths, arquivo_nomes = p_nomes,
      status = 'enviada', correcao = null, erro = null, nome_lido = p_nome where id = p_envio returning * into v_envio;
  else
    if p_remover or p_anteriores is not null then
      raise exception 'O envio mudou. Recarregue a página.' using errcode = 'P0001';
    end if;
    insert into public.submissoes(id,prova_id,aluno_id,arquivo_paths,arquivo_nomes,status,nome_lido)
      values(p_envio,p_prova,p_aluno,p_paths,p_nomes,'enviada',p_nome) returning * into v_envio;
  end if;
  return jsonb_build_object('id',v_envio.id,'status',v_envio.status,'arquivo_paths',v_envio.arquivo_paths,
    'arquivo_nomes',v_envio.arquivo_nomes,'created_at',v_envio.created_at);
end;
$$;
revoke all on function public.confirmar_envio_aluno(uuid,uuid,uuid,text[],text[],text[],text,boolean) from public, anon, authenticated;
grant execute on function public.confirmar_envio_aluno(uuid,uuid,uuid,text[],text[],text[],text,boolean) to service_role;
notify pgrst, 'reload schema';
commit;
