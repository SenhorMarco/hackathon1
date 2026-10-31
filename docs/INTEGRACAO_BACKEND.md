# Integração do backend

Este documento descreve pontos de integração e um contrato sugerido. Não é um backend implementado. A interface atual continua funcional com mocks até ser adaptada.

## Pontos exatos a substituir

| Arquivo / função | Comportamento atual | Integração esperada |
|---|---|---|
| `src/lib/data.ts` / `seed()` | Cria três turmas e provas fictícias | Carregar turmas autorizadas do professor autenticado |
| `src/components/workspace.tsx` / efeitos com `aula-clara-v3` | Lê e grava todo o estado no localStorage | Consultar e atualizar a API, com carregamento, erro e tentativas |
| `patchRoom` | Atualiza uma turma no estado React | Persistir os dados na API antes de confirmar sucesso |
| `patchExam` | Atualiza prova e invalida revisões quando critérios mudam | Atualização transacional com controle de versão do barema |
| `CreateExam` | Guarda nome do arquivo e usa `questions()` | Enviar arquivo, iniciar extração e consultar andamento |
| `rememberFile` / `showFile` | Criam e abrem uma URL temporária local | Enviar bytes ao armazenamento e obter URL autorizada de visualização |
| `runCorrection` | Gera notas fictícias deterministicamente | Iniciar job de OCR/correção por questão e consultar resultados |
| `release` | Verifica aprovações e marca como concluída | Validar no servidor, registrar liberação e disponibilizar devolutivas |
| `weakTopics`, `grade`, `examMax`, `hasGrade` | Calculam relatórios no cliente | Usar dados autorizados e versionados; reproduzir cálculos no servidor |

Na interface, `patchExam` pode receber uma função. Não envie uma função na requisição HTTP: transforme a ação em um payload explícito. A atualização otimista, se usada, deve reverter em caso de falha.

## Entidades sugeridas

| Entidade | Campos / relacionamentos principais |
|---|---|
| Professor | `id`, nome, identificação da conta |
| Turma | `id`, `professorId`, nome, disciplina, turno |
| Aluno | `id`, nome, e-mail |
| Matrícula | `turmaId`, `alunoId`, situação |
| Prova | `id`, `turmaId`, título, data, status, arquivo original, liberação |
| Questão | `id`, `provaId`, enunciado, tópico, dificuldade, resposta de referência |
| Barema | `id`, `questaoId`, versão, critérios, pesos, estratégia principal/alternativa |
| Resposta | `id`, `provaId`, `questaoId`, `alunoId`, arquivo, texto extraído |
| Correção | `id`, `respostaId`, versão do barema, nota sugerida, nota final, feedback, aprovação |
| Ajuste | `id`, `correcaoId`, autor, data, valor anterior, valor novo e justificativa |
| Job | `id`, tipo, estado, progresso, erro e resultado |

Os tipos atuais estão em `src/lib/data.ts`. A UI usa `responses` como um objeto indexado por `alunoId:questaoId` dentro de cada prova. O banco pode usar registros normalizados e a camada de API transformá-los nesse formato. Atribua IDs estáveis do servidor; não confie em IDs enviados pelo navegador para conceder acesso.

## Proposta de rotas HTTP

| Método | Rota | Finalidade |
|---|---|---|
| GET | `/api/me` | Professor autenticado |
| GET, POST | `/api/classes` | Listar / criar turmas |
| GET, PATCH | `/api/classes/:classId` | Consultar / editar turma |
| GET, POST | `/api/classes/:classId/students` | Listar / matricular alunos |
| GET, POST | `/api/classes/:classId/exams` | Listar / criar provas |
| GET, PATCH | `/api/exams/:examId` | Consultar / editar prova |
| POST | `/api/exams/:examId/files` | Prova e barema opcional, em multipart |
| POST | `/api/exams/:examId/analyze` | Iniciar análise; retornar `jobId` |
| GET | `/api/jobs/:jobId` | Consultar job de análise ou correção |
| PATCH | `/api/exams/:examId/questions/:questionId` | Editar enunciado, dificuldade e solução |
| PUT | `/api/questions/:questionId/rubric` | Salvar nova versão de barema |
| POST | `/api/exams/:examId/students/:studentId/questions/:questionId/response` | Enviar resposta escaneada |
| POST | `/api/exams/:examId/corrections` | Iniciar pré-correção; retornar `jobId` |
| PATCH | `/api/corrections/:correctionId` | Revisar nota, feedback e estratégia |
| POST | `/api/corrections/:correctionId/approve` | Aprovar a revisão |
| POST | `/api/exams/:examId/release` | Liberar correções após validação |
| GET | `/api/exams/:examId/results` | Grade e análise de questões |
| GET | `/api/classes/:classId/report` | Relatório agregado da turma |
| GET | `/api/classes/:classId/students/:studentId/history` | Histórico e plano individual |

### Exemplo de atualização da correção

```json
{
  "score": 2.7,
  "feedback": "Estratégia alternativa válida. Faltou registrar a unidade no resultado.",
  "adjustmentReason": "A estratégia equivalente atende aos critérios da versão 2.",
  "rubricVersion": 2,
  "expectedVersion": 4
}
```

O servidor retorna a correção atualizada, com nova versão e autoria do ajuste. Uma versão desatualizada deve resultar em conflito, sem sobrescrever silenciosamente a revisão de outro usuário.

## Fluxo de arquivo e processamento

1. Autenticar o professor e verificar acesso à turma/prova.
2. Receber e validar o arquivo (tipo real, tamanho e vínculo correto).
3. Guardar o arquivo e seu identificador no servidor/armazenamento de objetos.
4. Criar um job de processamento; a API retorna `202` e `jobId`.
5. A interface acompanha o job e exibe os resultados para revisão.
6. Guardar barema, versão, sugestões e decisões do professor separadamente.
7. Exigir aprovação humana antes da liberação das notas.

A solução alternativa deve criar ou vincular uma estratégia válida ao barema da questão, preservando o total da questão e invalidando revisões incompatíveis.

## Configuração do frontend

Com API separada, você pode adicionar `NEXT_PUBLIC_API_URL` e ler `process.env.NEXT_PUBLIC_API_URL` em um cliente HTTP. **Essa variável ainda não é consumida pelo código atual**: adicionar a variável, sozinho, não conecta o frontend.

As variáveis `NEXT_PUBLIC_*` ficam expostas ao navegador e são incorporadas no build estático. Não coloque senhas, segredos do banco ou chaves de IA nelas. Use um backend para essas integrações. Se a API estiver em outro domínio, configure CORS e a política de autenticação de forma coerente.

## Regras a garantir no servidor

- Isolamento entre professores, turmas, alunos e provas em todas as consultas.
- Notas entre zero e o máximo de cada questão; pendência representada por `null`, não zero.
- Barema sem critérios vazios e com total positivo por questão.
- Mudança de barema invalida aprovações afetadas e exige nova revisão.
- Liberação condicionada às aprovações necessárias e a critérios válidos.
- Histórico de ajustes com autor, data e valores anteriores, além do feedback final.
- Processamento repetido não deve duplicar respostas ou sobrescrever revisão humana silenciosamente.
- Relatórios históricos devem considerar versões e resultados efetivamente liberados.

## Migração em etapas

1. Autenticação, turmas, alunos e prova persistentes.
2. Armazenamento e recuperação de arquivos.
3. Baremas e correção manual persistentes.
4. Jobs de OCR/análise e sugestões de correção.
5. Liberação, relatórios e entrega ao aluno, conforme a infraestrutura escolhida.

O backend pode evoluir sem redesenhar as telas: substitua as ações locais progressivamente, mantendo contratos explícitos e tratamento de erros.
