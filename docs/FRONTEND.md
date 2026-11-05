# Interface do professor — Aula Clara

A interface do professor faz parte da aplicação Next.js na raiz do repositório. Use Node.js 22.18+ ou 24+:

```bash
npm ci
npm run dev
```

Abra http://localhost:3000 e entre em `/login` com uma conta de professor. Para configurar Supabase Auth e o banco, siga [docs/CONTAS.md](CONTAS.md) e configure as variáveis de `.env.example`.

## Páginas e componentes

- `/professor/dashboard`: visão geral das turmas e provas.
- `/professor/provas`: preparação, análise, barema, recebimento e revisão de provas.
- `/professor/alunos`: cadastro e consulta dos alunos da turma.
- `/professor/relatorios`: resultados factuais baseados em notas validadas e exportação CSV.
- `src/components/workspace.tsx`: estrutura da área do professor e seleção do contexto.
- `src/components/correction-review.tsx`: revisão individual, resultados, devolutivas e liberação.
- `src/lib/review.ts`: validação de resposta, completude, total final e escaping de CSV.

## Fluxo de revisão

O fluxo recebe os arquivos associados pelo professor a alunos confirmados. A pré-correção da IA cria sugestões para cada resposta identificada. Na revisão, o professor seleciona uma questão, consulta a transcrição e a análise sugerida e pode abrir os arquivos originais. Ele informa ou ajusta a nota, escreve o feedback e valida cada resposta separadamente. Se a leitura foi sinalizada como incerta, a validação exige a conferência do arquivo original.

O agrupamento por abordagem é opcional e apenas organiza a fila de revisão. A aprovação de grupos foi desativada; uma resposta nunca herda automaticamente a nota ou o feedback de outra resposta.

Transcrições com questão ausente, fora do barema ou duplicada são mantidas como pendências com identificadores técnicos que não são exibidos como números de questão. O professor abre o arquivo, escolhe uma questão livre e associa a resposta manualmente. O servidor limpa nota e comentário anteriores e marca a leitura como incerta, para que a resposta seja avaliada de novo pelo barema correto. Se a IA não extraiu a resposta, o professor pode registrar a transcrição após conferir o arquivo e selecionar a questão; o registro começa sem nota e não substitui resposta existente. Não é possível registrar outra resposta enquanto houver uma associação pendente nessa submissão.

Antes de preparar e liberar devolutivas, o sistema verifica que cada submissão tem um aluno confirmado, pré-correção concluída e exatamente uma resposta para cada questão do barema. Cada resposta deve ter nota dentro do máximo e feedback não vazio. Respostas extras ou sem correspondência no barema, além de respostas ausentes ou duplicadas, mantêm a liberação bloqueada. Uma resposta ausente permanece pendente, não recebe zero por padrão.

As devolutivas são preparadas com notas e comentários validados, e o texto gerado pela IA precisa de revisão e aprovação humana por aluno. O servidor calcula um snapshot SHA-256 a partir do barema, análise, referências dos arquivos, transcrição, notas e comentários usados. Depois da resposta da IA, compara novamente o snapshot; se os dados mudaram durante a geração, não salva o texto. A edição do texto também usa uma versão de conteúdo para rejeitar gravações baseadas em revisão desatualizada. A liberação exige texto válido e aprovado para a revisão atual. Preparar ou aprovar a devolutiva não a publica: o professor libera os resultados em uma ação explícita.

Essas verificações ocorrem em etapas entre rotas e não formam uma transação única do banco. Há uma janela de concorrência entre operações simultâneas; uma garantia transacional no banco permanece pendente.

## Relatórios e CSV

Os resultados mostram notas validadas por questão. Total e média só são calculados para provas completas; provas com qualquer pendência ficam identificadas como em revisão e não entram na média. A média informa a cobertura parcial da turma quando nem todos os envios estão completos.

A exportação CSV inclui uma coluna por questão, total validado e situação. Notas de questões sem validação aparecem como `Pendente`; o total também fica pendente se a prova não estiver completa. O arquivo usa codificação UTF-8 com BOM e separador ponto e vírgula.

## Persistência e configuração

As operações do professor usam as APIs de servidor e Supabase. As rotas verificam sessão, papel e propriedade dos dados. Os arquivos são mantidos no bucket privado e acessados por links temporários. Configure as variáveis, schema e autenticação conforme [README.md](../README.md) e [docs/CONTAS.md](CONTAS.md). Os drafts de edição ainda não salvos não são compartilhados entre dispositivos.

## Portal do aluno integrado

O portal `/aluno` lista as turmas vinculadas ao e-mail da conta autenticada. O aluno escolhe a turma e a prova. Antes de as questões estarem disponíveis, pode enviar um PDF ou até dez fotos da prova inteira; depois, pode enviar, substituir ou remover fotos por questão enquanto a prova aceitar respostas. A substituição invalida a correção anterior para nova revisão. Notas e comentários de respostas individualmente validadas aparecem questão por questão antes da liberação final; a devolutiva completa fica disponível após a publicação.

O servidor lê o campo opcional `provas.prazo_envio`. Se não houver prazo, aceita envios enquanto o estado da prova permitir; após o encerramento do prazo ou da prova, rejeita o envio. Na aba Respostas, o professor configura o prazo e pode prorrogá-lo para um aluno específico, ou revogar a exceção. Datas são exibidas no fuso do navegador e enviadas como instantes UTC. Exige a migração `supabase/prazos.sql`.

## Média e histórico do painel

O painel carrega as respostas persistidas junto com as provas, tanto na abertura quanto na atualização da turma. A média considera somente submissões completas e individualmente validadas, com as mesmas verificações de completude do relatório. Respostas ausentes não viram zero; uma nota zero explicitamente validada entra normalmente. Cartão e gráfico indicam quantos alunos têm notas completas. Depois da liberação, o painel atualiza os resultados do servidor.

Verificação local: `node scripts/testar-dashboard.mjs` cobre médias, zero real, ausência, cobertura parcial, duplicatas, limites e alunos com referência local anterior.

## Limites conhecidos

- **RN17 não implementada:** mudanças de barema não invalidam ou marcam automaticamente como desatualizadas as sugestões já produzidas, e não há aviso completo sobre notas afetadas.
- **RN19 não implementada:** notas/feedback alterados após a liberação não têm fluxo completo de atualização da devolutiva nem indicação de alteração ao aluno.
- O envio da prova inteira e os envios, substituições e remoções por questão estão integrados. O portal também mostra notas e comentários validados por questão antes da liberação final. Prazo geral e exceção individual são aplicados também na confirmação e na remoção de arquivos. A publicação bloqueia novos envios mesmo quando há uma exceção.

## Testes da revisão

```bash
node scripts/testar-revisao.mjs
node scripts/testar-revisao-api.mjs
node scripts/testar-revisao-browser.mjs
node scripts/testar-pendencias.mjs
```

O primeiro script exercita as regras puras de validação, completude, totalização e exportação CSV. `testar-pendencias.mjs` confere que linhas sem número, desconhecidas ou duplicadas são preservadas com transcrição intacta e sem nota. O teste de API e o de navegador exercitam o fluxo de revisão com dependências simuladas; não são uma verificação de serviços externos em produção.

Para checagens gerais, execute `npm run lint`, `npm run typecheck` e `npm run build`.

## Instalação e verificação dos prazos

Antes de publicar a versão, execute `supabase/prazos.sql` no SQL Editor do mesmo projeto, após as migrações de schema e contas. O script adiciona duas colunas e a função `confirmar_envio_aluno`, executável apenas pelo servidor. O upload final confere o prazo e a versão dos arquivos na transação que invalida respostas e devolutiva anteriores. Mudanças de prazo e finalização do envio usam o mesmo bloqueio da linha da prova.

Testes: `node scripts/testar-prazos.mjs` e `node --experimental-vm-modules scripts/testar-prazos-api.mjs`. Para testar a migração em PostgreSQL local com PGlite, instale `@electric-sql/pglite` num ambiente de teste e execute `node scripts/testar-prazos-sql.mjs` (ou defina `PGLITE_MODULE` para seu arquivo `dist/index.js`). Esse teste não substitui a validação no Supabase real nem mede concorrência de múltiplas conexões.

Checklist no deploy: salvar prazo futuro; fechar prazo no passado; conferir bloqueio no primeiro envio/substituição/remoção; prorrogar somente um aluno; confirmar envio desse aluno e bloqueio dos demais; revogar exceção; preparar upload antes e tentar finalizar após o encerramento; confirmar nova revisão após substituir arquivo; conferir bloqueio total após publicação.
