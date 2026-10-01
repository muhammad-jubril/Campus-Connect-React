import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Loud and early, same principle as the vanilla build's supabase-config.js —
  // "nothing happens when I tap Continue" is a much worse debugging
  // experience than a clear message at startup.
  throw new Error(
    "Supabase isn't configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env (see .env.example)."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
