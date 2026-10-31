-- Modelo do banco do Corretor IA (Supabase / Postgres).
-- Rodar uma vez no SQL Editor do projeto Supabase.
--
-- Decisões para o MVP:
-- * Sem login: um professor de demonstração. O app acessa o banco só pelo
--   servidor, com a service role key; RLS fica ligado e sem políticas, então
--   nada é acessível direto do navegador.
-- * As respostas da IA ficam em jsonb, no formato de src/lib/ai/schemas.ts.
-- * O aluno vê o feedback por um link com token, sem conta.

create table if not exists turmas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists alunos (
  id          uuid primary key default gen_random_uuid(),
  turma_id    uuid not null references turmas(id) on delete cascade,
  nome        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists provas (
  id                uuid primary key default gen_random_uuid(),
  turma_id          uuid references turmas(id) on delete set null,
  titulo            text not null,
  arquivo_path      text,              -- caminho no bucket "provas"
  status            text not null default 'rascunho'
                    check (status in ('rascunho', 'analisada', 'barema_pronto', 'corrigindo', 'corrigida')),
  analise           jsonb,             -- AnaliseProva
  barema            jsonb,             -- Barema (versão atual, editável pelo professor)
  barema_origem     text check (barema_origem in ('sugerido', 'analisado')),
  barema_problemas  jsonb,             -- ResultadoBarema.problemas
  created_at        timestamptz not null default now()
);

-- Compatível também com bancos que já executaram a versão anterior do esquema.
alter table provas add column if not exists arquivo_nome text;
alter table provas add column if not exists data_avaliacao date;

-- Uma submissão = a prova respondida por um aluno (uma ou mais páginas).
create table if not exists submissoes (
  id             uuid primary key default gen_random_uuid(),
  prova_id       uuid not null references provas(id) on delete cascade,
  aluno_id       uuid references alunos(id) on delete set null,
  arquivo_paths  text[] not null default '{}',
  status         text not null default 'enviada'
                 check (status in ('enviada', 'corrigindo', 'corrigida', 'erro')),
  nome_lido      text,                 -- CorrecaoAluno.nomeLido
  correcao       jsonb,                -- CorrecaoAluno completa
  erro           text,
  created_at     timestamptz not null default now()
);

-- Grupos de respostas parecidas de uma questão. O professor aprova por grupo.
create table if not exists grupos (
  id                   uuid primary key default gen_random_uuid(),
  prova_id             uuid not null references provas(id) on delete cascade,
  numero               int not null,   -- número da questão
  rotulo               text not null,
  categoria            text not null
                       check (categoria in ('correto', 'alternativo_valido', 'parcial', 'erro', 'em_branco')),
  descricao            text not null default '',
  nota_sugerida        numeric not null default 0,
  comentario_sugerido  text not null default '',
  criterio_sugerido    jsonb,          -- CriterioBarema para solução alternativa
  aprovado             boolean not null default false,
  nota_final           numeric,
  comentario_final     text,
  created_at           timestamptz not null default now()
);

-- Uma resposta = uma questão de uma submissão.
create table if not exists respostas (
  id                uuid primary key default gen_random_uuid(),
  submissao_id      uuid not null references submissoes(id) on delete cascade,
  prova_id          uuid not null references provas(id) on delete cascade,
  numero            int not null,
  correcao          jsonb not null,    -- CorrecaoQuestao
  grupo_id          uuid references grupos(id) on delete set null,
  nota_final        numeric,           -- preenchida quando o professor aprova
  comentario_final  text,
  unique (submissao_id, numero)
);

create table if not exists feedbacks (
  id            uuid primary key default gen_random_uuid(),
  submissao_id  uuid not null unique references submissoes(id) on delete cascade,
  token         text not null unique default replace(gen_random_uuid()::text, '-', ''),
  conteudo      jsonb not null,        -- FeedbackAluno
  publicado     boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists submissoes_prova_idx on submissoes (prova_id);
create index if not exists respostas_prova_numero_idx on respostas (prova_id, numero);
create index if not exists grupos_prova_numero_idx on grupos (prova_id, numero);

alter table turmas     enable row level security;
alter table alunos     enable row level security;
alter table provas     enable row level security;
alter table submissoes enable row level security;
alter table grupos     enable row level security;
alter table respostas  enable row level security;
alter table feedbacks  enable row level security;

-- Bucket privado para as provas (em branco e respondidas).
insert into storage.buckets (id, name, public)
values ('provas', 'provas', false)
on conflict (id) do nothing;
