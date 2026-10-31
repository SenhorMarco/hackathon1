# Aula Clara — Corretor IA

Aplicação Next.js para apoiar professores na preparação de provas, revisão individual de respostas e consulta de resultados. A IA produz sugestões; a nota e o feedback só são considerados validados após a ação do professor.

## Executar

Use Node.js 22.18+ ou 24+ na raiz do repositório:

```bash
npm ci
npm run dev
```

Abra http://localhost:3000. Para os fluxos de servidor, configure as variáveis de `.env.example` em `.env.local` e aplique os scripts SQL descritos em [Contas](docs/CONTAS.md). O acesso às áreas de professor e aluno usa Supabase Auth.

```bash
npm run lint
npm run typecheck
npm run build
npm start
```

## Fluxo do professor

1. Entre com uma conta de professor, crie uma turma e cadastre alunos.
2. Envie a prova em PDF, PNG ou JPEG. A análise usa IA para identificar questões e sugerir um barema; revise os dados e confirme o barema antes da correção.
3. Receba os arquivos das provas dos alunos pelo fluxo disponível, confira a sugestão de nome e confirme manualmente o aluno.
4. Na revisão, confira a transcrição, a análise sugerida e o arquivo original. Ajuste a nota e escreva o feedback de cada resposta; a validação é individual. Respostas ilegíveis exigem conferência explícita do arquivo. Transcrições sem questão identificada ou duplicadas são preservadas como pendentes; associe cada uma manualmente após abrir o arquivo. A associação limpa qualquer nota sugerida e exige avaliação individual.
5. Se uma resposta não tiver sido transcrita, o professor pode registrar sua transcrição após conferir o arquivo e selecionar a questão. Esse registro começa sem nota e não substitui respostas existentes; pendências de associação precisam ser resolvidas antes.
6. A aplicação verifica completude por questão e por prova. Respostas ausentes, duplicadas, sem questão correspondente ou sem nota/feedback válidos impedem a preparação/liberação das devolutivas. Ausência de resposta identificada não vira nota zero automaticamente.
7. Consulte médias e totais somente das provas completamente validadas. A exportação CSV inclui as notas por questão, total e situação; pendências aparecem como `Pendente` ou `Em revisão` e não entram na média.

O agrupamento por abordagem é opcional e serve para organizar a leitura. Não aprova respostas em lote: cada resposta mantém sua própria nota e feedback. Devolutivas são geradas a partir dos dados validados, depois revisadas e aprovadas textualmente pelo professor; a publicação exige uma confirmação explícita. A geração valida um snapshot SHA-256 das notas, comentários, transcrições, referências dos arquivos, barema e análise antes de salvar; se a revisão mudar durante a geração, o texto é descartado. Edições do texto também usam controle otimista de versão.

Essas verificações sequenciais não oferecem transação única entre rotas concorrentes. Uma transação no banco continua sendo trabalho futuro para eliminar essa janela de concorrência.

## Estado e limites do MVP

Turmas, alunos, provas, submissões, respostas e resultados do professor são persistidos no Supabase, sob controle de conta e propriedade. O bucket `provas` é privado; os links de arquivo são temporários. O localStorage mantém apenas estado auxiliar da interface e não substitui os registros do banco.

Ainda não estão implementadas as regras **RN17** (invalidar/avisar quando o barema muda em relação a sugestões e notas já revisadas) e **RN19** (alteração pós-liberação atualizar a devolutiva e indicar ao aluno que houve mudança). O envio pelo próprio aluno e o gerenciamento de prazos estão em trabalho paralelo. Não trate essas regras como cobertas pelo MVP atual.

## Configuração do Supabase

1. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` conforme `.env.example`. A chave `service_role` é somente de servidor.
2. Execute `supabase/schema.sql` e `supabase/contas.sql` no mesmo projeto Supabase. Configure Email Auth, confirmação de e-mail e as URLs de callback conforme [docs/CONTAS.md](docs/CONTAS.md).
3. Para análise por IA, configure `FEATHERLESS_API_KEY` e, se necessário, `AI_MODEL` com modelo que aceite imagem.
4. Reinicie a aplicação depois de alterar variáveis. Em produção, configure-as no ambiente Production e faça novo deployment.

O endpoint `/api/health` verifica a presença das configurações, o acesso às colunas necessárias e a existência do bucket privado; não confirma por si só que a chave/modelo de IA funcionam.

## Upload e análise

Na aba de provas, PDF, PNG e JPEG podem ser enviados até 20 MB por arquivo. O envio da prova usa o Storage privado; a análise lê provas PDF ou imagem e sugere questões e barema. O fluxo de respostas aceita PDFs individuais ou conjuntos de imagens de um aluno. A sugestão de nome não cria associação: o professor escolhe o aluno e confirma. PDFs contendo provas de vários alunos não são separados automaticamente.

O navegador envia arquivos diretamente ao bucket privado por URLs assinadas. A finalização verifica tamanho, conteúdo e vínculo antes de registrar prova/submissão. Uploads abandonados antes da finalização podem deixar objetos sem registro no bucket e exigem limpeza operacional. Para detalhes de configuração e fluxo, consulte [docs/FRONTEND.md](docs/FRONTEND.md) e [docs/CONTAS.md](docs/CONTAS.md).

## Testes de integração

Os scripts de integração usam serviços simulados, salvo indicação em contrário, e não enviam arquivos ou dados ao Supabase/IA reais:

```bash
node scripts/testar-revisao.mjs
node scripts/testar-revisao-api.mjs
node scripts/testar-revisao-browser.mjs
node scripts/testar-pendencias.mjs
node scripts/testar-upload.mjs
node scripts/testar-contas.mjs
```

`testar-revisao.mjs` cobre regras de validação, completude, totalização e CSV. `testar-pendencias.mjs` cobre a preservação de transcrições sem número, desconhecidas ou duplicadas sem nota final. Os scripts `testar-revisao-api.mjs` e `testar-revisao-browser.mjs` cobrem a revisão por API e a interface com dependências simuladas. `testar-upload.mjs` cobre os fluxos de upload e análise simulados; `testar-contas.mjs` confere autenticação e autorização com Supabase simulado.

## Estrutura

- `src/app/`: páginas e rotas de API.
- `src/components/`: workspace e interface de revisão do professor.
- `src/lib/`: autenticação, banco, análise de IA e regras de revisão.
- `supabase/`: schema e migrações SQL.
- `scripts/`: testes de integração e utilitário de hospedagem estática.
- `docs/`: documentação de interface, integração e regras do produto.
