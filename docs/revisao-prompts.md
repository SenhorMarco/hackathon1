# Revisão dos prompts e falhas observadas

Os testes usam apenas questões e respostas sintéticas. A avaliação inicial com Qwen2.5-3B-Instruct mostrou respostas que passavam no Zod, mas continham erros de conteúdo. JSON válido não é evidência de correção pedagógica.

| Falha observada | Alteração aplicada | Limite da verificação |
| --- | --- | --- |
| Análise de equação simples mencionou duas leituras sem evidência | Pedir explicação direta da resposta única, sem inventar ambiguidades | O conteúdo da observação continua exigindo revisão |
| Barema já dizia `Isolar 2x=4`, mas a IA apontou essa informação como ausente | Permitir `problemas: []`, exigir problema concreto e comparação literal | Não há verificador automático de toda crítica em texto livre |
| Transcrição trocou o erro `x=4` pela resposta correta `x=2` | Separar cópia, avaliação e pontuação; conferir cópia exata com `respostasTexto` | A comparação só é possível quando o original textual foi fornecido por questão |
| Texto digitado foi marcado como ilegível | Esclarecer que erro matemático não significa ilegibilidade e bloquear saída com `legivel: false` | A IA ainda pode declarar incorretamente que leu uma imagem |
| Um passo foi marcado incorreto, mas o primeiro erro apontava outro índice | Conferir índice contra os valores booleanos dos passos | Isso detecta contradição estrutural, não resolve a matemática |
| Resultado errado foi chamado de método alternativo | Distinguir mudança válida de método de erro dentro do método padrão | A classificação depende de avaliação matemática |
| Nota ou critérios podem ser inventados | Conferir IDs, duplicações, limites, soma e pontuação de cada questão | Atribuir um critério existente sem evidência ainda pode passar |

A escala provisória de 10 pontos foi removida: para sugerir barema novo, a chamada deve informar a pontuação por questão. Isso evita inserir uma decisão de produto dentro do prompt.

As verificações estão em `src/lib/ai/validacao.ts`. Uma inconsistência gera `ErroRevisaoIA`, preservando a sugestão em `resultado` e os alertas em `motivos`. O consumidor pode mostrar ambos ao professor como pendência e não deve transformar a exceção em nota zero. Ainda é necessário conectar esse comportamento às rotas e telas. A intenção é apoiar a pré-correção, mantendo a decisão do professor em todos os casos.

O schema original continua compatível com o banco. Uma evolução futura pode representar explicitamente resposta ausente, transcrição incerta e nota não disponível; hoje a função bloqueia a saída ilegível em vez de entregar zero provisório ao fluxo.

## Evidências reproduzíveis

- `scripts/check-validacao-ia.ts`: testes locais, sem custo de API, aceitando uma correção coerente e bloqueando nove entradas inválidas.
- `scripts/testar-prompts-texto.mts`: dois casos pequenos com o modelo econômico. Após os ajustes, o barema coerente passou; a correção foi bloqueada por leitura insuficiente e pontuação incompatível.
- `scripts/avaliar-prompts.mts`: nove casos com modelo selecionável, incluindo os sete originais, raiz estranha e erro propagado com crédito parcial explícito. Os relatórios dos novos modelos recebem o identificador do modelo no nome para preservar os anteriores. `TESTE_MAX_TOKENS` permite até 8.000 tokens por chamada e `TESTE_ORCAMENTO_USD` configura o limite de custo já informado pela API (até US$ 1). Chamadas interrompidas sem uso retornado não entram nesse controle de custo; o limite de 14 chamadas continua valendo.

Os casos com mudança de números e método ajudam a detectar uma melhoria restrita ao exemplo incluído no prompt. Mesmo que todos passem, uma execução por caso não mede acurácia nem estabilidade em provas reais. Testes com digitalizações e revisão de um professor são necessários para ampliar a evidência.

Na inspeção manual do caso sem critérios atendidos do modelo 72B, a pontuação e os campos esperados estavam corretos, mas um comentário atribuiu ao aluno uma divisão que não estava escrita. Esse tipo de inferência em texto livre não é detectado pelas asserções atuais. Portanto, "caso aprovado" no relatório significa que as verificações programadas passaram, não que cada frase foi validada pedagogicamente.

## Resultado da avaliação ampliada

| Modelo | Casos com verificações aprovadas | Custo informado nas respostas recebidas |
| --- | --- | --- |
| Qwen2.5-72B-Instruct | Barema coerente, barema sugerido, correção correta, parcial e sem critérios atendidos: 5 casos | US$ 0,00311063 |
| Qwen2.5-32B-Instruct | Método alternativo válido e enunciado com dados insuficientes: 2 casos | US$ 0,00275980 |

O modelo de 72B excedeu o tempo de espera ao tentar o método alternativo; uma retomada também foi interrompida por demora. Os dois casos restantes foram executados com 32B e estão em `docs/avaliacao-prompts-complemento.json`. As sete respostas registradas somam US$ 0,00587043, sem incluir possíveis cobranças de chamadas interrompidas para as quais não houve informação de uso. Não é uma comparação controlada entre modelos: foram conjuntos diferentes, com uma execução por caso. Os modelos e limites padrão do produto não foram alterados.

## Rodada com Kimi K2.5

Com o mesmo conjunto original e dois casos novos, `moonshotai/Kimi-K2.5` passou nas verificações dos nove casos em nove chamadas, sem repetição estrutural. Foram usados até 6.000 tokens de saída por chamada, com custo informado total de US$ 0,064580488. Os tempos variaram de 14,4 a 51,6 segundos, com média de 34,5 segundos por chamada. O relatório completo está em `docs/avaliacao-prompts-moonshotai-Kimi-K2.5.json`.

Nos dois casos novos, o modelo preservou os pontos dos passos corretos, rejeitou a raiz x=-1 na equação sqrt(x+2)=x e atribuiu crédito à divisão correta após um erro anterior quando o barema explicitamente previa isso. Também preservou os textos fornecidos e distinguiu erro matemático de ilegibilidade.

Na leitura manual, as explicações ficaram mais fundamentadas nesses casos. Há ainda formulações a revisar: no caso do retângulo, "cada par de lados [...] gera um perímetro diferente" é uma generalização excessiva (trocar base e altura preserva o perímetro), embora o diagnóstico de que a área não determina um perímetro único esteja correto. Não houve teste de imagens nesta rodada. O resultado apoia usar Kimi como candidato para a próxima etapa de validação, sem equivaler a uma estimativa de acurácia nem a uma comparação estatística entre modelos.
