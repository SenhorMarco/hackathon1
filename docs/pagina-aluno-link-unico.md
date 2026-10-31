# Página do aluno por link único

Cartão: [Página do aluno por link único](https://app.notion.com/p/b7ecdd6312118291aa7081062fbf4601), responsável Ferreira, P0, Ordem 21. Status alterado para Fazendo antes do trabalho e Testando durante a validação.

## Comportamento

O professor gera as devolutivas, aprova as notas e usa **Liberar correções** na aba **Correção**. A tela fornece um link `/aluno/TOKEN` para cada aluno. O aluno abre o link em outro navegador, sem login. Quem possui esse link consegue ler a devolutiva; ele deve ser compartilhado somente com o destinatário.

A implementação existente foi mantida, incluindo a geração do token no banco, sua preservação ao refazer a devolutiva e os links exibidos ao professor. O carregamento da página foi corrigido para:

- Consultar somente a devolutiva publicada correspondente ao token e aguardar a requisição atual, sem congelar o estado de publicação na página estática.
- Conferir a submissão, o aluno e a prova relacionada antes de renderizar; a prova deve estar liberada (`corrigida`).
- Tratar erros do banco explicitamente. Uma falha operacional mostra uma mensagem genérica com **Tentar novamente**, sem detalhes do provedor.
- Validar o formato da devolutiva e do barema e conferir a presença das notas finais. Uma nota pendente não é transformada em zero.
- Mostrar **Devolutiva indisponível** para tokens inválidos, inexistentes, não publicados ou com vínculos ausentes, sem informar se há dados daquele aluno.
- Desabilitar indexação e envio do endereço como referência de navegação, e acomodar nomes longos no celular.

Foi corrigida também a regra CSS do Turbopack: o loader global transformava `aluno.module.css` em CSS comum, retirando o mapa de classes usado pela página. A condição exclui `*.module.css` dessa regra, permitindo o processamento nativo de CSS Modules pelo Next.js. O bundler padrão continua sendo Turbopack.

O layout de devolutiva, as notas finais, os comentários explícitos do professor e os exercícios existentes foram preservados. A tarefa não inclui mudanças nos prompts, na geração de feedback com IA, na tela de grupos ou no esquema do banco.

## Validação local

```bash
npm run lint
npm run typecheck
npm run build
PLAYWRIGHT_MODULE=/caminho/absoluto/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/caminho/dos/browsers \
node scripts/testar-pagina-aluno.mjs
```

A suíte inicia o Next.js compilado e um serviço HTTP que simula o Supabase; nenhuma chamada de IA é realizada. Exercita:

1. Tokens malformados, inexistentes e não publicados sem dados pessoais.
2. Liberação pela rota real da aplicação, mantendo o mesmo token.
3. Nome, nota final de 1,5/2, comentário explícito do professor e exercício expansível, sem cookies de login.
4. Dois alunos em contextos independentes de navegador, sem misturar os conteúdos.
5. Retirada de publicação após uma visita bem-sucedida, sem continuar exibindo a correção.
6. Submissão inexistente e aluno não associado.
7. Erro de banco com mensagem genérica e recuperação pelo botão.
8. JSON incompleto e nota pendente, sem apresentar uma nota zero inventada.
9. Largura de celular e nome longo sem transbordamento horizontal.

Como a página usa streaming com Suspense, um estado indisponível pode chegar com HTTP 200 depois que a estrutura inicial foi enviada. O teste confere a interface efetivamente renderizada e a ausência dos dados, sem usar somente o status HTTP como evidência.

## Validação com Supabase real

As credenciais do banco não estavam configuradas localmente no início desta tarefa; o acesso administrativo à Vercel retornava 403 na auditoria anterior. Foi solicitado configurar `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` em `.env.local`, sem enviar os valores pelo chat.

O roteiro abaixo está preparado para validar com banco real. Não exige IA nem consome créditos de IA. Cria duas provas, dois alunos e devolutivas manuais sintéticas para testar exclusivamente leitura/publicação. Esses registros **permanecem no banco**, identificados pelo prefixo `VALIDACAO_LINK_ALUNO_`; nenhum registro existente é removido.

```bash
PLAYWRIGHT_MODULE=/caminho/absoluto/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/caminho/dos/browsers \
node scripts/testar-pagina-aluno-real.mjs https://seu-deploy --criar-dados-sinteticos
```

O Supabase configurado deve ser o mesmo usado pelo domínio informado. O relatório com os identificadores e links sintéticos fica em `/tmp/hackathon-student-page-real.json` (ou no caminho definido por `REPORT_PATH`). O teste verifica persistência da publicação, token estável, dois navegadores independentes sem login, notas e comentários finais, recarga e retirada de publicação.

**Não tratar a suíte local simulada como comprovação com Supabase real.** O cartão permanece em Testando enquanto faltar essa verificação. Para testar manualmente com dados já disponíveis, libere uma devolutiva sintética pela interface e abra seu link em janela anônima; confira notas e comentários, recarregue e compare com o link de outro aluno fictício.
