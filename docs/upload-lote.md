# Upload em lote das provas dos alunos

Escopo informado: “Professor escolhe o aluno numa lista; IA sugere o nome lido no cabeçalho”.

## Como testar manualmente

1. Instale as dependências com `npm ci`. Configure `.env.local` a partir de `.env.example`.
2. No Supabase, aplique `supabase/schema.sql`. Tenha uma turma, pelo menos dois alunos nela e uma prova com `turma_id` apontando para essa turma. Use apenas nomes e provas fictícios na demonstração.
3. Execute `npm run dev` e abra `/provas/<UUID-da-prova>/submissoes`.
4. Clique em **Adicionar prova de aluno**, escolha as imagens de uma prova e confira a ordem mostrada. A primeira página deve conter o cabeçalho. Adicione outro item para outro aluno.
5. Clique em **Sugerir nome com IA**. Confira o texto lido e selecione o aluno da lista. Quando houver um único nome completo correspondente, o botão **Selecionar aluno com esse nome** ajuda a preencher a lista. A seleção nunca é automática.
6. Confirme os alunos e envie o lote. Confira um resultado por item e o resumo. No banco, cada item deve gerar uma linha em `submissoes`, com `aluno_id`, `prova_id`, `nome_lido`, `status = enviada` e as páginas ordenadas em `arquivo_paths`. Os arquivos ficam no bucket privado `provas`.
7. Teste cabeçalho ausente/ilegível e indisponibilidade da IA: a seleção manual e o upload devem continuar disponíveis. O sucesso do upload não depende da IA.
8. Teste arquivo vazio, PDF, imagem acima de 5 MiB e mais de 10 páginas. A tela deve explicar a rejeição. O total por aluno é limitado a 20 MiB, também no servidor.
9. Simule falha no envio de um item: os demais continuam. Repita o lote; itens já enviados não são reenviados. Após uma tentativa, os dados daquele item ficam fixos para manter a repetição consistente; para mudar aluno/páginas, remova o item e crie outro.

## Decisões técnicas

- Usa a estrutura existente de Supabase, sem migração de banco. A rota server-side verifica se o aluno pertence à turma da prova, independentemente do valor enviado pelo navegador.
- Usa o cliente Featherless e a validação JSON existentes. Apenas a primeira página é enviada para a leitura opcional do nome; nomes e respostas brutas não são registrados em logs de erro.
- PNG, JPEG e WebP seguem os formatos aceitos pela integração atual de visão. PDF **não é suportado**: requer conversão de páginas, que não existe no repositório. Essa restrição aparece na tela.
- Cada item é uma prova com uma ou mais páginas. O lote é enviado sequencialmente, isolando falhas e limitando uso de memória/carga.
- Um UUID estável por item evita duplicar uma submissão quando a resposta de um envio bem-sucedido se perde e o professor repete a tentativa na mesma tela. Recarregar a página cria outro lote; não há deduplicação por conteúdo.
- Caminhos são gerados pelo servidor, sem usar os nomes originais dos arquivos. O servidor confere tamanho, quantidade, MIME e assinatura inicial das imagens. Isso não substitui uma decodificação completa da imagem.
- Se o armazenamento de uma página ou o registro no banco falhar, tenta remover somente os arquivos daquela tentativa. Uma falha da própria limpeza pode deixar arquivos órfãos; storage e banco não compartilham transação.
- Mantém o modelo de demonstração existente, sem login: acesso ao banco e às credenciais somente no servidor. Autenticação não faz parte deste cartão.
- A página usa `Suspense` e `connection()` para carregar os dados no momento da requisição com `cacheComponents` habilitado.

## Verificações nesta implementação

Com Node.js 24, execute diretamente:

```bash
node scripts/upload-lote.test.mjs
node --experimental-transform-types scripts/upload-lote-api.test.mjs
npm run lint
npm run build
# Alternativa para este ambiente, que bloqueia a porta local usada pelo Turbopack:
npm run build -- --webpack
```

Os testes cobrem limites, assinatura dos arquivos, nomes ambíguos, associação à turma, ordem das páginas, limpeza após falhas, repetição sem duplicação e limite do corpo sem `Content-Length`. Também verificam a leitura do nome, cabeçalho sem identificação e falha da IA seguida de upload manual. Executam os handlers reais e a validação JSON/Zod, substituindo as conexões externas com Supabase e IA. Não comprovam conectividade com esses serviços. O sinalizador `--experimental-transform-types` permite executar a classe com propriedades de parâmetro existente em `src/lib/ai/json.ts` no Node.js 24.

Resultados: **17 testes aprovados**, `npm run lint` aprovado e **build com Webpack aprovado**, incluindo TypeScript e geração das páginas. O comando padrão `npm run build` foi executado, mas o Turbopack abortou ao tentar abrir uma porta local no processamento do CSS (`Operation not permitted`), inclusive na tentativa com permissões ampliadas. Nenhuma configuração de build foi alterada para contornar essa limitação do ambiente.

A documentação local instalada em `node_modules/next/dist/docs` foi consultada para Route Handlers, `connection()` e `cacheComponents`. As rotas não exportam `runtime`, pois essa configuração é incompatível com Cache Components nesta versão. O lint também orientou a separar o carregamento dos dados da renderização JSX no tratamento de erros.

Não houve teste manual no navegador nem chamada real à IA/Supabase: `.env.local` não está configurado neste ambiente.

## Entrega e acompanhamento

O Kanban retornou `404 object_not_found`. O cartão não foi alterado nem marcado como concluído.

A entrega usa exclusivamente a branch **`ferreira`**, conforme orientação atual do usuário, sem criar ou renomear branches. Antes das alterações desta revisão, foi realizado `git pull --ff-only origin main` mantendo `ferreira`, porque a branch ainda não existia no remoto. As alterações preexistentes em `.gitignore` e `AGENTS.md` foram preservadas e ficam fora do commit da funcionalidade.

O PR deve registrar estas verificações e limitações. A atualização do cartão e a confirmação dos critérios de aceite dependem de acesso ao Kanban. O roteiro acima permite testar com os serviços reais quando as credenciais estiverem disponíveis.
