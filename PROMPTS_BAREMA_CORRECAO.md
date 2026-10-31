# Prompts de barema e pré-correção

As funções `gerarBarema` e `corrigirAluno`, em `src/lib/ai/barema.ts` e `src/lib/ai/correcao.ts`, utilizam `gerarJson` com os contratos Zod existentes. Ambas precisam de um cliente e modelo fornecidos pelo servidor. Não criam rotas, gravam alterações ou aprovam resultados.

`gerarBarema` recebe a análise e, opcionalmente, o barema fornecido pelo professor. Sem barema, a chamada precisa informar `valoresQuestoes`, por exemplo `{ 1: 2 }`. A função não inventa mais uma escala de 10 pontos. O barema de entrada pode ter inconsistências a analisar; o resultado proposto é conferido quanto à origem, questões, IDs únicos, pontos não negativos e soma dos critérios igual ao total informado.

`corrigirAluno` recebe análise, barema revisado, texto e imagens opcionais. Quando o texto original já está disponível por questão, informe `respostasTexto: [{ numero: 1, texto: "..." }]`; a função exige que a transcrição seja idêntica e que todas essas respostas sejam retornadas. Para imagens, a fidelidade da transcrição ainda depende de revisão humana.

Antes de retornar, a função confere IDs de critérios, pontuação, coerência entre os passos e o índice do primeiro erro e sinaliza resultados marcados como ilegíveis. Violações geram `ErroRevisaoIA`, com uma lista de `motivos` e o `resultado` original. O consumidor pode mostrar a sugestão e os alertas ao professor como pendência, junto da resposta do aluno; a exceção não significa que a sugestão deva ser descartada nem convertida em nota zero. Não há repetição automática por falha semântica, para evitar que o modelo simplesmente declare a leitura legível na segunda tentativa. O schema continua compatível com o banco; as verificações distinguem uma sugestão consistente de uma sugestão que exige atenção adicional. Toda pré-correção continua sujeita à revisão do professor.

Zod verifica a estrutura; as novas verificações cobrem relações numéricas e referências, mas não comprovam que um critério foi realmente atendido nem detectam toda contradição em texto livre. Uma soma correta pode partir de critérios atribuídos incorretamente. A integração e o professor continuam responsáveis pela revisão matemática e pedagógica.

Verificação local sem API: `npx tsx scripts/check-validacao-ia.ts`. Teste econômico com duas chamadas: `npx tsx scripts/testar-prompts-texto.mts`. Avaliação mais ampla com sete casos sintéticos: `npx tsx scripts/avaliar-prompts.mts [modelo]`; o resultado é registrado em `docs/avaliacao-prompts.json`. Execuções únicas são evidência desses casos, não uma taxa de acurácia do produto.
