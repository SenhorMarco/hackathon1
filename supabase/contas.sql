-- Execute APÓS schema.sql. Preserva provas existentes e não atribui dados automaticamente.
begin;
create table if not exists public.perfis (
 id uuid primary key references auth.users(id) on delete cascade,
 nome text not null check(length(nome) between 2 and 100),
 papel text not null check(papel in ('professor','aluno')),
 created_at timestamptz not null default now()
);
alter table public.perfis enable row level security;
revoke all on public.perfis from anon, authenticated;
grant select on public.perfis to authenticated;
grant all on public.perfis to service_role;
drop policy if exists perfil_proprio on public.perfis;
create policy perfil_proprio on public.perfis for select to authenticated using(id=auth.uid());
-- O papel é definido somente na criação. Alterar user_metadata não altera o perfil.
create or replace function public.criar_perfil_conta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.perfis(id,nome,papel) values(new.id,
 left(coalesce(nullif(trim(new.raw_user_meta_data->>'nome'),''),'Usuário'),100),
 case when new.raw_user_meta_data->>'papel'='professor' then 'professor' else 'aluno' end);
 return new;
end; $$;
revoke all on function public.criar_perfil_conta() from public, anon, authenticated;
drop trigger if exists criar_perfil_conta on auth.users;
create trigger criar_perfil_conta after insert on auth.users for each row execute function public.criar_perfil_conta();
-- Contas anteriores ficam como alunos; o administrador pode promovê-las explicitamente.
insert into public.perfis(id,nome,papel) select id,'Usuário','aluno' from auth.users on conflict(id) do nothing;
alter table public.turmas add column if not exists professor_id uuid references public.perfis(id);
alter table public.turmas add column if not exists disciplina text not null default 'Física';
alter table public.turmas add column if not exists turno text not null default 'Manhã';
alter table public.alunos add column if not exists email text;
create index if not exists turmas_professor_idx on public.turmas(professor_id);
create index if not exists alunos_email_idx on public.alunos(lower(email));
-- Os registros legados continuam sem dono até atribuição explícita pelo administrador.
-- Exemplo, substituindo os dois UUIDs:
-- update public.turmas set professor_id='UUID_DA_CONTA_PROFESSOR' where id='UUID_DA_TURMA';
-- Os endpoints usam service_role com autorização no servidor. Nenhuma tabela
-- educacional nem o Storage é aberta diretamente ao cliente autenticado.
revoke all on public.turmas,public.alunos,public.provas,public.submissoes,
 public.respostas,public.grupos,public.feedbacks from anon,authenticated;
commit;
