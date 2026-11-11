-- Somente leitura: lista chamadas ativas de publicação via PostgREST.
-- Executar após reaplicar publicacao.sql. Não contém cancelamento ou exclusão.
-- Se houver linhas, conferir os PIDs/horários do teste antes de encerrar sessões.
select pid, query_start as iniciada_em, state as estado,
       wait_event_type as tipo_espera, wait_event as espera
from pg_stat_activity
where usename = 'authenticator'
  and state = 'active'
  and query ilike '%publicar_prova%'
  and pid <> pg_backend_pid()
order by query_start;
