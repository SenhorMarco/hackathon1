# Contratos JSON das etapas de IA

Os contratos executáveis estão em `src/lib/ai/schemas.ts`: eles são a fonte de verdade para nomes, tipos e valores aceitos. `gerarJson` em `src/lib/ai/json.ts` gera o JSON Schema a partir do Zod e valida a resposta. Os exemplos abaixo ilustram o formato atual; não indicam que os fluxos ou os prompts já estejam implementados.

Todos os exemplos usam a mesma questão fictícia. Os números de questão são locais à prova e começam em 1. IDs de critérios devem permanecer estáveis quando usados na correção; IDs de respostas no agrupamento são os IDs reais da tabela `respostas`, fornecidos pelo backend, não nomes de alunos inventados pela IA.

## 1. Análise prévia — `AnaliseProva`

Implementada em `POST /api/exams/:examId/analyze`, junto com a sugestão de barema. O resultado é persistido e exibido para revisão.

Saída da análise da prova para revisão do professor. `existenciaResposta.status` aceita `unica`, `multiplas`, `sem_solucao` ou `ambigua`; a dificuldade aceita `facil`, `media` ou `dificil`.

```json
{
  "questoes": [{
    "numero": 1,
    "enunciado": "Resolva 2x + 3 = 7.",
    "conteudo": "equação do primeiro grau",
    "resolucao": {"passos": ["Subtrair 3 dos dois lados: 2x = 4.", "Dividir por 2: x = 2."], "respostaFinal": "x = 2"},
    "existenciaResposta": {"status": "unica", "observacao": "A equação tem uma solução."},
    "problemasEnunciado": [],
    "dificuldadeEstimada": "facil",
    "justificativaDificuldade": "Exige operações elementares."
  }],
  "observacoesGerais": "A questão apresentada possui enunciado claro."
}
```

## 2. Barema — `ResultadoBarema`

A análise inicial devolve `Barema` junto com `AnaliseProva`; o servidor registra a origem `sugerido`. Edições são confirmadas por `PUT /api/exams/:examId/rubric`, com validação das somas, vínculos e versão. A análise de um arquivo de barema fornecido separadamente ainda não está implementada.

Saída de sugestão (`sugerido`) ou análise do barema fornecido pelo professor (`analisado`). A versão em `barema` é proposta pela IA e deve ser revisada pelo professor antes da correção. `problemas` pode ser vazio.

```json
{
  "origem": "sugerido",
  "barema": {"questoes": [{
    "numero": 1,
    "valorTotal": 2,
    "criterios": [
      {"id": "q1-c1", "descricao": "Isola o termo 2x corretamente.", "pontos": 1},
      {"id": "q1-c2", "descricao": "Encontra x = 2 corretamente.", "pontos": 1}
    ]
  }]},
  "problemas": []
}
```

No caso `analisado`, cada problema tem `numero`, `descricao` e `sugestao`. O backend deve conferir que `valorTotal` corresponde à soma dos pontos dos critérios antes de usar o barema; o schema atual verifica tipos, mas não essa soma.

## Leitura do cabeçalho — `NomeCabecalho`

A rota de leitura de nome usa esse contrato antes da correção e retorna `{ "nomeLido": null }` ou o nome transcrito (até 150 caracteres). A entrada é a metade superior da primeira página, renderizada como imagem também para PDFs. O resultado é gravado em `submissoes.nome_lido`; somente a confirmação explícita do professor define `submissoes.aluno_id`. Falhas de leitura preservam o arquivo e permitem seleção manual. Essa etapa está implementada; correção e demais etapas continuam dependendo das integrações descritas abaixo.

## 3. Correção — `CorrecaoAluno`

Saída para uma submissão, com uma correção por questão. `nomeLido` pode ser `null` e é apenas sugestão: o professor confirma o aluno. `primeiroPassoErrado` usa índice começando em 1 ou `null`. `criteriosAtendidos` contém os IDs do barema revisado.

```json
{
  "nomeLido": null,
  "questoes": [{
    "numero": 1,
    "transcricao": "2x = 4; x = 4",
    "legivel": true,
    "passos": [
      {"descricao": "Isolou 2x: 2x = 4.", "correto": true, "comentario": "Subtraiu 3 corretamente."},
      {"descricao": "Concluiu x = 4.", "correto": false, "comentario": "Não dividiu 4 por 2."}
    ],
    "metodo": "padrao",
    "descricaoMetodo": "Isolamento da incógnita.",
    "tipoErro": "calculo",
    "primeiroPassoErrado": 2,
    "criteriosAtendidos": ["q1-c1"],
    "notaSugerida": 1,
    "justificativa": "Isolou 2x corretamente, mas não concluiu a divisão."
  }]
}
```

`metodo` aceita `padrao` ou `alternativo`. `tipoErro` aceita `nenhum`, `calculo`, `sinal`, `conceito`, `incompleto`, `em_branco` ou `outro`. Leitura ilegível ou página ausente não deve ser tratada automaticamente como resposta em branco: sinalizar para revisão humana. Nota e justificativa são sugestões, não decisão final.

## 4. Agrupamento — `AgrupamentoQuestao`

Entrada operacional: respostas da mesma questão, cada uma com seu ID real. A IA devolve grupos sugeridos para revisão do professor. `categoria` aceita `correto`, `alternativo_valido`, `parcial`, `erro` ou `em_branco`.

```json
{
  "numero": 1,
  "grupos": [{
    "rotulo": "Não dividiu por 2",
    "categoria": "parcial",
    "descricao": "Isolou 2x, mas concluiu x = 4.",
    "respostaIds": ["00000000-0000-4000-8000-000000000001"],
    "notaSugerida": 1,
    "comentarioSugerido": "Você isolou o termo corretamente; revise a divisão final.",
    "criterioSugerido": null
  }]
}
```

`criterioSugerido` tem o formato de um critério do barema ou `null`; é uma sugestão para solução alternativa válida e exige decisão do professor. Antes de aplicar grupos, o backend deve conferir se os IDs pertencem à questão solicitada, se não há duplicações ou omissões e se as notas respeitam o barema. O schema atual não valida essas relações.

## 5. Feedback — `FeedbackAluno`

Gerar e publicar somente com base na correção revisada e nos ajustes do professor. O objeto contém feedback por questão, resumo e próximos passos; não substitui a nota ou o comentário final aprovados.

```json
{
  "resumo": "Você isolou o termo com x corretamente. Revise a última operação para concluir a resolução.",
  "questoes": [{
    "numero": 1,
    "acertos": "Você subtraiu 3 dos dois lados.",
    "erro": "A divisão final não foi feita.",
    "porque": "O coeficiente 2 multiplica x e precisa ser removido dos dois lados.",
    "dica": "Que operação desfaz uma multiplicação por 2?",
    "exercicios": [{"enunciado": "Resolva 3x = 12.", "resposta": "x = 4"}]
  }],
  "proximosPassos": ["Pratique o isolamento da incógnita em equações simples."]
}
```

## Integração e limites

- O fluxo esperado é análise → revisão do barema → correção → agrupamento e revisão → feedback. O backend deve fornecer a cada etapa os dados necessários e persistir as decisões do professor separadamente das sugestões.
- O banco previsto guarda `AnaliseProva` em `provas.analise`, `Barema` em `provas.barema`, a correção completa em `submissoes.correcao`, a correção por questão em `respostas.correcao` e `FeedbackAluno` em `feedbacks.conteudo`. Grupos e seus membros são mapeados para `grupos` e `respostas.grupo_id`.
- Todos os campos mostrados são obrigatórios no schema atual; use `null` apenas nos campos definidos como anuláveis e arrays vazios quando apropriado. O contrato de feedback descreve 1 ou 2 exercícios, mas o Zod atual não impõe essa quantidade.
- A validação estrutural não comprova leitura correta, cálculo correto, associação ao aluno, integridade dos IDs, coerência da pontuação ou segurança da publicação. Essas verificações e a revisão humana precisam ser tratadas pelo fluxo de aplicação.
- Para conferir a conversão dos seis contratos em JSON Schema, instale as dependências do projeto e execute `npx tsx scripts/check-schemas.ts`.
