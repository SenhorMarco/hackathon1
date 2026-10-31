// Confere se cada contrato da IA vira um JSON Schema válido para o prompt.
// Uso: npx tsx scripts/check-schemas.ts
import { z } from "zod";
import * as S from "../src/lib/ai/schemas";

const contratos = {
  AnaliseProva: S.AnaliseProva,
  ResultadoBarema: S.ResultadoBarema,
  NomeCabecalho: S.NomeCabecalho,
  CorrecaoAluno: S.CorrecaoAluno,
  AgrupamentoQuestao: S.AgrupamentoQuestao,
  FeedbackAluno: S.FeedbackAluno,
};

for (const [nome, schema] of Object.entries(contratos)) {
  const jsonSchema = JSON.stringify(z.toJSONSchema(schema));
  console.log(`${nome}: ${jsonSchema.length} caracteres de JSON Schema`);
}
