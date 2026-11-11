# Publicação transacional — 10/11/2026

**Status atualizado em 11/11: implementação e testes locais aprovados; migração inicial aplicada e API publicada. O teste integrado encontrou incompatibilidade no código de conflito; a correção PT409 está validada localmente e precisa ser reaplicada no Supabase antes de concluir o card.** [Resultado integrado e pendência atual](TESTE_PUBLICACAO_DEPLOY_2026-11-11.md). Card RN03/RN18: bloquear liberação até completar a validação da prova. A liberação continua sendo da prova inteira, abrangendo todas as submissões confirmadas existentes.

## Alteração

A API mantém as verificações de questões esperadas, notas individuais, teto, associação, leitura, texto da devolutiva e aprovação da revisão atual. Em seguida chama `publicar_prova` com uma cópia exata dos dados que validou. A função compara essa cópia com o banco sob bloqueio e publica todas as devolutivas e o estado da prova na mesma transação. Uma falha reverte ambas as gravações. Repetir uma publicação idêntica é permitido.

O snapshot inclui turma, barema, análise, submissões, alunos associados, arquivos, respostas, notas, comentários e conteúdo completo das devolutivas. A ordenação é por ID; a comparação usa JSONB. Status final da prova e flags de publicação não fazem parte da comparação, permitindo a repetição sem ignorar mudanças na revisão.

Triggers fazem as gravações de respostas, submissões, grupos e devolutivas participarem do bloqueio da prova. Após publicar, rejeitam alterações na revisão e no barema. Alterações de prazo continuam possíveis, sem reabrir o envio. A transição para publicada e as flags das devolutivas passam exclusivamente pela função transacional. Só `service_role` executa a função; a API autentica o professor e a função confere novamente a propriedade da turma.

Conflitos de versão, bloqueio de prova publicada ou deadlock são respondidos como 409 para recarregar/tentar novamente. Nenhum resultado parcial é publicado. As verificações semânticas completas continuam na API confiável; a função SQL não reimplementa o cálculo do hash de aprovação, e sim garante que exatamente os dados validados sejam usados na transação.

## Evidências locais

- TypeScript e lint dos arquivos alterados: aprovados.
- Build de produção (`next build --webpack`): aprovado.
- `scripts/testar-revisao-api.mjs`: aprovado. Inclui completude, teto, leitura manual, versões, aprovação de texto, liberação repetida, turma com devolutiva faltante, payload da RPC, ausência de updates diretos, conflito 409 sem publicação, função ausente 503 e prova sem autorização 404.
- `scripts/testar-revisao.mjs`, `scripts/testar-dashboard.mjs` e `scripts/testar-pendencias.mjs`: aprovados.
- `scripts/testar-publicacao-sql.mjs`: aprovado em PostgreSQL nativo 18.6, usando três conexões e apenas fixtures locais.

O teste SQL verifica reaplicação da migração, equivalência do snapshot TypeScript/SQL, professor não proprietário, negação a `anon`/`authenticated`, publicação de dois alunos e repetição idempotente. Cinco mudanças invalidam o snapshot sem publicar: nota, arquivo, barema, nova submissão e texto da devolutiva. Uma falha sintética disparada após atualizar a prova reverte o status e todas as flags de publicação. Gravações diretas de `publicado=true` ou `status=corrigida` são recusadas. Depois da publicação, alteração de arquivos/barema e criação/edição/exclusão de grupos também são recusadas.

Os testes concorrentes observam efetivamente uma espera por lock em `pg_stat_activity`. Quando uma edição de nota começa primeiro, a publicação aguarda e rejeita a versão antiga após o commit da edição. Quando a publicação começa primeiro, uma edição de nota ou de texto aguarda e é rejeitada após a publicação, preservando o valor anterior.

Para repetir os testes SQL, instale `embedded-postgres@18.6.0-beta.19` em um diretório de ferramentas e defina `EMBEDDED_POSTGRES_MODULE` com a URL `file:///.../node_modules/embedded-postgres/dist/index.js`. Execute `node scripts/testar-publicacao-sql.mjs` na raiz do repositório. O script inicia um PostgreSQL temporário em `127.0.0.1`, não carrega `.env.local`, não acessa o Supabase e encerra o processo no bloco `finally`. Os dados sintéticos ficam em `tmp/postgres-publicacao-*`, ignorado pelo Git.

## Aplicação e validação no deploy

1. No SQL Editor do mesmo projeto Supabase do Gaider, executar **todo** `supabase/publicacao.sql`, após as migrações de esquema, contas e prazos já existentes. O arquivo é transacional e reaplicável; não remove registros nem arquivos.
2. Publicar a API desta branch em seguida. Os guards da migração recusam as duas gravações independentes usadas pela versão antiga durante a troca. Sem a migração, a API nova retorna 503, sem fallback inseguro.
3. Confirmar o deploy bem-sucedido e repetir o fluxo autenticado com uma prova sintética: bloquear liberação incompleta, concluir revisão e aprovação, publicar, repetir a chamada e abrir a devolutiva como aluno. Verificar no banco todas as flags e o status da prova.
4. Confirmar que tentativas de editar nota, arquivo, barema ou texto depois da publicação recebem conflito e preservam os dados. Atualizar este relatório e o card com o resultado real.

Na conferência inicial de 10/11, a chamada somente de leitura a `snapshot_publicacao` retornou **404 / PGRST202**. Em 11/11, após aplicação pelo usuário, retornou **200** e a API foi publicada. As variáveis locais permitem acesso de aplicação, mas não execução administrativa SQL; a correção mais recente do mesmo arquivo precisa ser reaplicada pelo SQL Editor.

## Limites

Os testes nativos usam o esquema mínimo compatível e não certificam os outros triggers instalados manualmente no Supabase. O teste integrado continua obrigatório antes de marcar o card como Feito. RN17 (mudanças no barema antes da publicação) e RN19 (reabrir/alterar resultados publicados e notificar o aluno) permanecem em seus próprios cards. Este trabalho não mede acurácia da IA e não transforma todas as rotas de edição em transações únicas; garante a fronteira de publicação e a preservação da revisão publicada.
