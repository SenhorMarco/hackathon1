-- Executar APÓS schema.sql, contas.sql e prazos.sql. Reaplicável; preserva dados.
-- A API valida completude, tetos, leitura e aprovação/hash da devolutiva.
-- O banco congela a prova e compara exatamente esses dados antes das duas gravações.
begin;

create or replace function public.snapshot_publicacao(p_prova uuid) returns jsonb
language sql volatile security definer set search_path = pg_catalog, public as $$
 select jsonb_build_object(
   'prova', jsonb_build_object('turma_id',p.turma_id,'barema',p.barema,'analise',p.analise),
   'submissoes', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'aluno_id',s.aluno_id,'status',s.status,'arquivo_paths',s.arquivo_paths) order by s.id)
     from public.submissoes s where s.prova_id=p.id),'[]'::jsonb),
   'respostas', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'prova_id',r.prova_id,'submissao_id',r.submissao_id,'numero',r.numero,
     'correcao',r.correcao,'nota_final',r.nota_final,'comentario_final',r.comentario_final) order by r.id)
     from public.respostas r join public.submissoes s on s.id=r.submissao_id where s.prova_id=p.id),'[]'::jsonb),
   'feedbacks', coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'submissao_id',f.submissao_id,'conteudo',f.conteudo) order by f.id)
     from public.feedbacks f join public.submissoes s on s.id=f.submissao_id where s.prova_id=p.id),'[]'::jsonb)
 ) from public.provas p where p.id=p_prova;
$$;
revoke all on function public.snapshot_publicacao(uuid) from public, anon, authenticated;
grant execute on function public.snapshot_publicacao(uuid) to service_role;

-- Todas as escritas da revisão participam do mesmo bloqueio, inclusive rotas antigas.
-- Feedback usa AFTER INSERT para não inverter a ordem de locks no ON CONFLICT UPDATE.
create or replace function public.proteger_revisao_publicada() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
 v_row jsonb; v_old jsonb; v_prova uuid; v_status text; v_publicando boolean;
begin
 if tg_op='DELETE' then v_row:=to_jsonb(old); else v_row:=to_jsonb(new); end if;
 if tg_op='UPDATE' then
   v_old:=to_jsonb(old);
   if v_row=v_old then return new; end if;
   if v_row->'id' is distinct from v_old->'id'
      or v_row->'prova_id' is distinct from v_old->'prova_id'
      or (tg_table_name in ('feedbacks','respostas') and v_row->'submissao_id' is distinct from v_old->'submissao_id') then
     raise exception 'Não mova registros de revisão entre provas' using errcode='55000';
   end if;
 end if;
 if tg_table_name='feedbacks' then
   select p.id,p.status into v_prova,v_status from public.provas p
     join public.submissoes s on s.prova_id=p.id where s.id=(v_row->>'submissao_id')::uuid for update of p;
 else
   select p.id,p.status into v_prova,v_status from public.provas p where p.id=(v_row->>'prova_id')::uuid for update;
 end if;
 if not found then
   -- Permite apenas cascatas cujo registro pai já foi removido pela transação.
   if tg_op='DELETE' then return old; end if;
   raise exception 'Prova não encontrada para revisão' using errcode='55000';
 end if;
 v_publicando:=coalesce(current_setting('gaider.publicando_prova',true),'')=v_prova::text;
 if v_status='corrigida' and not (tg_table_name='feedbacks' and tg_op='UPDATE' and v_publicando
   and (v_row-'publicado')=(v_old-'publicado')) then
   raise exception 'A prova já foi publicada' using errcode='55000';
 end if;
 if tg_table_name='feedbacks' and tg_op<>'DELETE' and coalesce((v_row->>'publicado')::boolean,false)
   and not v_publicando then
   raise exception 'Use a publicação transacional' using errcode='55000';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.proteger_revisao_publicada() from public, anon, authenticated;

drop trigger if exists gaider_trava_respostas on public.respostas;
create trigger gaider_trava_respostas before insert or update or delete on public.respostas for each row execute function public.proteger_revisao_publicada();
drop trigger if exists gaider_trava_submissoes on public.submissoes;
create trigger gaider_trava_submissoes before insert or update or delete on public.submissoes for each row execute function public.proteger_revisao_publicada();
drop trigger if exists gaider_trava_grupos on public.grupos;
create trigger gaider_trava_grupos before insert or update or delete on public.grupos for each row execute function public.proteger_revisao_publicada();
drop trigger if exists gaider_trava_feedbacks on public.feedbacks;
create trigger gaider_trava_feedbacks before update or delete on public.feedbacks for each row execute function public.proteger_revisao_publicada();
drop trigger if exists gaider_trava_feedbacks_insert on public.feedbacks;
create trigger gaider_trava_feedbacks_insert after insert on public.feedbacks for each row execute function public.proteger_revisao_publicada();

create or replace function public.proteger_publicacao_prova() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
 if old.status='corrigida' and (new.status is distinct from old.status or new.barema is distinct from old.barema
    or new.analise is distinct from old.analise or new.turma_id is distinct from old.turma_id) then
   raise exception 'A prova já foi publicada' using errcode='55000';
 end if;
 if new.status='corrigida' and old.status<>'corrigida'
    and coalesce(current_setting('gaider.publicando_prova',true),'')<>new.id::text then
   raise exception 'Use a publicação transacional' using errcode='55000';
 end if;
 return new;
end;
$$;
revoke all on function public.proteger_publicacao_prova() from public, anon, authenticated;
drop trigger if exists gaider_publicacao_prova on public.provas;
create trigger gaider_publicacao_prova before update on public.provas for each row execute function public.proteger_publicacao_prova();

create or replace function public.publicar_prova(p_prova uuid,p_professor uuid,p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_prova public.provas%rowtype; v_count integer; v_context text;
begin
 -- Editores de texto já bloqueiam a linha do feedback antes de chegar ao trigger.
 perform f.id from public.feedbacks f join public.submissoes s on s.id=f.submissao_id
   where s.prova_id=p_prova order by f.id for update of f;
 select * into v_prova from public.provas where id=p_prova for update;
 if not found or not exists(select 1 from public.turmas where id=v_prova.turma_id and professor_id=p_professor) then
   raise exception 'Prova não encontrada' using errcode='P0002';
 end if;
 if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or public.snapshot_publicacao(p_prova) is distinct from p_snapshot then
   -- PT409 é um conflito de negócio. Não usar 40001 aqui: versões do
   -- PostgREST repetem automaticamente serialization_failure sem encerrar.
   raise exception 'A revisão mudou durante a publicação' using errcode='PT409';
 end if;
 -- A comparação integral acima mantém válidas as verificações semânticas da API.
 select count(*) into v_count from public.submissoes where prova_id=p_prova;
 if v_count=0 or (case when jsonb_typeof(v_prova.barema->'questoes')='array'
     then jsonb_array_length(v_prova.barema->'questoes')=0 else true end)
   or exists(select 1 from public.submissoes s where s.prova_id=p_prova and
     (s.status<>'corrigida' or s.aluno_id is null or not exists(select 1 from public.alunos a where a.id=s.aluno_id and a.turma_id=v_prova.turma_id)))
   or exists(select 1 from public.respostas r join public.submissoes s on s.id=r.submissao_id where s.prova_id=p_prova and r.prova_id<>p_prova)
   or exists(select 1 from public.submissoes s left join public.feedbacks f on f.submissao_id=s.id where s.prova_id=p_prova and
     (f.id is null or coalesce(f.conteudo->>'__revisao','')!~'^[a-f0-9]{64}$' or coalesce(f.conteudo->>'__aprovadoEm','')='')) then
   raise exception 'A revisão precisa ser concluída e aprovada' using errcode='55000';
 end if;
 v_context:=coalesce(current_setting('gaider.publicando_prova',true),'');
 perform set_config('gaider.publicando_prova',p_prova::text,true);
 update public.feedbacks f set publicado=true from public.submissoes s where s.id=f.submissao_id and s.prova_id=p_prova and not f.publicado;
 update public.provas set status='corrigida' where id=p_prova;
 perform set_config('gaider.publicando_prova',v_context,true);
 return jsonb_build_object('liberadas',v_count);
end;
$$;
revoke all on function public.publicar_prova(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.publicar_prova(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
