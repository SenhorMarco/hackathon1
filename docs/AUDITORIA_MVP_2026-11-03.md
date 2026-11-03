# Auditoria do MVP — 03/11/2026

**Escopo:** inspeção do código em `9671668` e execução assistida no deploy `https://hackathon1-blond.vercel.app`. O commit exato servido pelo deploy não foi identificado. A validação ainda não percorreu todas as etapas ponta a ponta. Os itens abaixo distinguem lacunas verificáveis no código de observações no ambiente real.

## Lacunas confirmadas no código

1. **RN01 — barema fornecido pelo professor não está integrado ao fluxo.** Existe helper para sugerir/analisar barema (`src/lib/ai/barema.ts`, `gerarBarema`), mas não há chamadas a `gerarBarema` no restante de `src`; a rota de análise usa `gerarJson` diretamente e grava `barema_origem: 'sugerido'` (`src/app/api/exams/[examId]/analyze/route.ts:15, 33, 66`). A criação de prova recebe somente o arquivo da prova (`src/app/api/exams/route.ts:10-15, 47-51`). Portanto, a crítica/melhoria de um barema já existente não está ligada à API/UI atual.

2. **RN05 — professor não consegue definir prazo de envio pela aplicação.** A criação da prova não aceita `prazo_envio` (`src/app/api/exams/route.ts:10-15`); a regra de prazo só lê o campo opcional existente e fecha o envio quando expirado (`src/lib/aluno/portal.ts:49-53, 62-70`). Não foi encontrado fluxo de escrita para essa coluna.

3. **RN06/RN07 — exceção ou reabertura individual após o prazo não existe.** O aluno é bloqueado pelo estado global da prova e pelo prazo global (`src/app/api/aluno/provas/[provaId]/envio/route.ts:60-63, 84-87`). Não foi encontrado endpoint ou campo para professor autorizar substituição excepcional por aluno. Substituição normal apaga respostas anteriores e a correção armazenada (`envio/route.ts:27-38`), mas isso não implementa exceção após o prazo.

4. **RN08 — leitura duplicada pode deixar correção travada sem recuperação.** Respostas não identificadas/duplicadas são preservadas para associação humana (`src/lib/correction-rows.ts:3-15`), mas a interface só oferece associação a questões ainda sem resposta (`src/components/correction-review.tsx:136-137`). Se todas as questões já estiverem ocupadas, a UI informa que há duplicata; não há ação para descartar/remover a linha duplicada. A revisão exige exatamente uma linha por questão (`src/lib/review.ts:15-25`), então esse caso não pode ser concluído pelo fluxo disponível sem nova pré-correção, que substitui todas as linhas (`src/app/api/exams/[examId]/submissions/[submissionId]/correct/route.ts:71-79`).

5. **RN17 — alterações no barema após início da correção não são permitidas.** A rota de barema rejeita edição fora dos estados `rascunho`, `analisada` e `barema_pronto` (`src/app/api/exams/[examId]/rubric/route.ts:18-23`); a pré-correção move a prova para `corrigindo` (`src/app/api/exams/[examId]/submissions/[submissionId]/correct/route.ts:31-32`). Não há caminho para avisar sobre respostas validadas afetadas e deixar o professor decidir se reavalia.

6. **RN19 — nota/feedback não podem ser alterados depois da liberação.** A edição da resposta rejeita provas `corrigida` (`src/app/api/exams/[examId]/answers/[answerId]/route.ts:19`), e a edição de devolutiva rejeita prova ou texto publicado (`src/app/api/exams/[examId]/submissions/[submissionId]/feedback/route.ts:97-100`). Assim, falta o fluxo para corrigir resultado já divulgado e indicar a alteração ao aluno.

7. **Upload parcial de fotos invalida a submissão inteira.** Uma troca de fotos por questão preserva os arquivos das demais questões (`src/app/api/aluno/provas/[provaId]/envio/route.ts:104-106`), mas `salvarArquivos` apaga todas as respostas da submissão e limpa toda a correção (`envio/route.ts:27-38`). O comportamento parece mais amplo do que a troca de uma questão; verificar se é a decisão desejada, pois invalida sugestões/validações de páginas não substituídas.

## Verificações ponta a ponta pendentes

- [x] Concluir análise real da prova e confirmar estado/barema gravados, inclusive após recarregar a página.
- [ ] Percorrer envio do aluno, associação de aluno/questão, pré-correção, revisão individual e tratamento de resposta ausente/ilegível.
- [ ] Demonstrar caso de resposta duplicada sem questão livre e confirmar se existe recuperação operacional além de reprocessar a submissão.
- [ ] Substituir foto de uma questão após validação e confirmar quais respostas e devolutivas ficam invalidadas.
- [ ] Confirmar visibilidade de nota/comentário por questão antes da liberação, bloqueio de total/devolutiva completa até a validação total e liberação explícita.
- [ ] Confirmar que relatórios exibem somente notas validadas ou identificam dados preliminares.
- [ ] Testar prazo e exceção individual quando houver interface de configuração/autorização; hoje esses controles não estão implementados no código.

## Evidência de execução no deploy (fluxo ainda parcial)

- `/api/health` respondeu 200 e verificou banco/Storage.
- Acesso anônimo a `GET /api/exams` e chamadas anônimas a criação de turma/prova, liberação e envio do aluno retornaram 401.
- Login pela interface funcionou; foi criada turma sintética e enviado arquivo de prova com duas questões.
- A IA identificou as duas questões com pontuação máxima de 5 cada: equação `2x + 3 = 11` e área de retângulo de lados 3 cm e 4 cm. Respostas de referência corretas: `x = 4` e `12 cm²`.
- O professor alterou um critério da questão 1, confirmou o barema e recarregou a página. Turma, prova, estado Aguardando respostas e critério alterado permaneceram salvos.
- Sem submissões, a aba Correção informa Aguardando as provas dos alunos e não oferece liberação.
- Dados sintéticos mantidos: turma `TESTE MVP 03-11-2026`, prova `TESTE MVP — Duas questões — 03/11`. Arquivos locais e evidência visual em `tmp/deploy-qa-2026-11-03/` (ignorado pelo Git).
- Próxima etapa depende da criação/login da conta de aluno de teste pelo usuário, para vincular o e-mail e executar o envio autenticado. Nenhuma senha foi registrada no relatório.

A inspeção de código foi delegada a um subagente; as verificações HTTP e de navegador acima foram executadas pelo agente principal. Nenhum arquivo de implementação foi alterado nesta auditoria.
