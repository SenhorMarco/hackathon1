// Confere se cada contrato da IA vira um output format válido.
// Uso: npx tsx scripts/check-schemas.ts
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as S from "../src/lib/ai/schemas";

const contratos = {
  AnaliseProva: S.AnaliseProva,
  ResultadoBarema: S.ResultadoBarema,
  CorrecaoAluno: S.CorrecaoAluno,
  AgrupamentoQuestao: S.AgrupamentoQuestao,
  FeedbackAluno: S.FeedbackAluno,
};

for (const [nome, schema] of Object.entries(contratos)) {
  const formato = zodOutputFormat(schema) as unknown as { type: string; schema: object };
  console.log(`${nome}: ${formato.type}, ${JSON.stringify(formato.schema).length} caracteres de schema`);
}
