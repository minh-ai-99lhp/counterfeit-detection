import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  // Fail sớm, rõ ràng — thường do thiếu .env ở gốc project
  throw new Error(
    "Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Kiểm tra .env ở gốc project."
  )
}

export const supabase = createClient(url, anonKey)
