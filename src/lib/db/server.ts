import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Nome do bucket privado onde ficam as provas. */
export const BUCKET_PROVAS = "provas";

let client: SupabaseClient | null = null;

/**
 * Cliente Supabase com a service role key. Só pode ser usado no servidor
 * (rotas de API e Server Components): ignora RLS.
 */
export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
