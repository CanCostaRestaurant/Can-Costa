// Cliente Supabase para el browser (Client Components).
import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Supabase no configurado. Copia .env.local.example a .env.local y rellena las variables.",
    );
  }
  return createBrowserClient(url, anon);
}
