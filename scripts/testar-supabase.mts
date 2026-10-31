// Confere a conexão com o Supabase: tabelas do schema.sql e bucket de provas.
// Uso: npx tsx scripts/testar-supabase.mts
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

const url = process.env.SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");

const supabase = createClient(url, key, { auth: { persistSession: false } });

const tabelas = ["turmas", "alunos", "provas", "submissoes", "grupos", "respostas", "feedbacks"];
let falhas = 0;

for (const tabela of tabelas) {
  const { count, error } = await supabase.from(tabela).select("*", { count: "exact", head: true });
  if (error) {
    falhas++;
    console.log(`✗ ${tabela}: ${error.message}`);
  } else {
    console.log(`✓ ${tabela} (${count ?? 0} linhas)`);
  }
}

let { data: bucket } = await supabase.storage.getBucket("provas");
if (!bucket) {
  // O insert em storage.buckets do schema.sql nem sempre roda; cria pela API.
  const { error } = await supabase.storage.createBucket("provas", { public: false });
  if (error) console.log(`  não foi possível criar o bucket: ${error.message}`);
  ({ data: bucket } = await supabase.storage.getBucket("provas"));
}
if (!bucket) {
  falhas++;
  console.log("✗ bucket provas: não encontrado");
} else {
  console.log(`✓ bucket provas (público: ${bucket.public})`);
}

console.log(falhas ? `\n${falhas} problema(s). Rode supabase/schema.sql no SQL Editor.` : "\nSupabase pronto.");
