# Aula Clara — Corretor IA

Aplicação Next.js com a interface do professor, contratos de IA e estrutura de banco no mesmo projeto.

## Executar

Na raiz do repositório, com Node.js 22.18+ ou 24+:

```bash
npm ci
npm run dev
```

Abra http://localhost:3000. A interface combina dados de demonstração e localStorage com upload real de provas no Supabase. A leitura do nome no cabeçalho usa a IA; a correção e os demais fluxos ainda são demonstrativos. Para utilizar os módulos de servidor, configure as variáveis de `.env.example` em `.env.local`.

```bash
npm run typecheck
npm run lint
npm run build
npm start
```

## Estrutura

- `src/app/`: layout, estilos, página inicial e rotas do professor.
- `src/components/workspace.tsx`: interface e estado da área do professor.
- `src/lib/data.ts`: tipos, dados de demonstração e cálculos da interface.
- `src/lib/ai/` e `src/lib/db/`: módulos de IA e banco.
- `supabase/`: esquema SQL.
- `scripts/`: verificações de integração e utilitário de hospedagem estática.
- `docs/`: documentação da interface e exemplos de hospedagem.

Veja [a documentação da interface](docs/FRONTEND.md), [os pontos de integração](docs/INTEGRACAO_BACKEND.md) e [os contratos de IA](CONTRATOS_IA.md).

## Upload de provas

1. Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` em `.env.local`.
2. Execute `supabase/schema.sql` no SQL Editor do Supabase. O script inclui as colunas `arquivo_nome` e `data_avaliacao`, inclusive para bancos existentes, e o bucket privado `provas`.
3. Em “Nova prova”, informe título e data e selecione um PDF, PNG ou JPEG de até 20 MB. Clique em “Salvar prova”.
4. Confira o rascunho e clique no nome do arquivo para abri-lo. Recarregue a página e repita a consulta.

O envio salva a turma com um UUID estável, o arquivo no Storage e o registro em `provas`. Provas novas começam sem questões: não há extração ou análise de IA nesta etapa. Se o registro falhar, a API tenta remover o arquivo enviado. Não há transação distribuída entre Storage e Postgres; uma falha também na remoção é registrada no servidor.

O vínculo entre a turma da demonstração e seu UUID no banco fica no localStorage. As provas dessa turma são consultadas na API ao abrir a interface; limpar o localStorage perde esse vínculo local, mas não apaga os registros no Supabase. O cadastro da interface ainda é local; os alunos são sincronizados com o banco ao abrir os envios de uma prova. Baremas e correções permanecem no fluxo demonstrativo.

A API segue o modelo de demonstração definido no esquema: sem login, um único professor, acesso ao Supabase somente pelo servidor. O bucket privado é acessado por links assinados de 60 segundos. Autenticação e isolamento entre professores não fazem parte desta etapa.

```bash
# Após npm run build (ou npm run build -- --webpack).
# Teste com Node.js 22.18+; Supabase simulado, sem dados reais.
node scripts/testar-upload.mjs
```

## Upload em lote das provas dos alunos

1. Execute novamente `supabase/schema.sql` para adicionar os metadados das submissões e a referência dos alunos.
2. Cadastre os alunos na turma, crie uma prova pelo upload real e abra a aba **Respostas**.
3. Use **Adicionar PDFs em lote** (cada PDF é uma prova completa de um aluno) ou **Adicionar uma prova em imagens** (selecione todas as páginas do mesmo aluno, na ordem). É possível adicionar vários conjuntos antes de enviar.
4. Clique em **Enviar provas**. Os envios são sequenciais e uma falha não interrompe os demais. Provas que falharem permanecem na fila para nova tentativa; as já salvas não são reenviadas.
5. Confira a sugestão da IA e abra os arquivos, escolha o aluno na lista e clique em **Confirmar aluno**. A lista nunca é preenchida automaticamente pela IA.
6. Recarregue a página: os arquivos, a sugestão e o aluno confirmado são recuperados do banco. Para rever a sugestão, use **Reler cabeçalho**.

São aceitos PDF, PNG e JPEG, com até 20 MB por arquivo; um conjunto de imagens admite até dez páginas e 40 MB. PDFs com provas de vários alunos não são separados automaticamente. Cada clique de seleção de imagens cria um conjunto; a primeira imagem deve conter o cabeçalho.

Configure `FEATHERLESS_API_KEY` e, se necessário, `AI_MODEL` com um modelo com visão. Para PDFs, o servidor renderiza a primeira página; só sua metade superior é enviada à IA, assim como nas imagens. O processamento usa PDF.js e canvas no servidor. Os arquivos originais ficam no bucket privado. Sem chave, com PDF protegido/corrompido, nome ilegível ou falha do provedor, o upload é preservado e a seleção manual continua disponível. A chamada de IA tem timeout de 25 segundos por tentativa; uma resposta JSON inválida pode gerar uma segunda tentativa.

A sugestão é guardada em `nome_lido`; a confirmação explícita é guardada separadamente em `aluno_id`. A API verifica se o aluno pertence à turma da prova. O upload não realiza correção ou divisão das respostas por questão. As provas de demonstração anteriores mantêm seu fluxo local.

O teste `node scripts/testar-upload.mjs` cobre também lotes, imagens agrupadas, renderização de PDF, IA simulada, associação manual, aluno de outra turma, reenvio e limpeza após falha de banco. Ele não chama a IA nem o Supabase reais.
