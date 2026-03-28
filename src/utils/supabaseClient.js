import { createClient } from '@supabase/supabase-js';

// .env金庫から、URLと合鍵を取り出す
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 取り出した情報を使って、Supabaseとの通信窓口を作る
export const supabase = createClient(supabaseUrl, supabaseAnonKey);