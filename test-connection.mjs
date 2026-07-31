import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Thieu SUPABASE_URL hoac SUPABASE_ANON_KEY trong file .env')
  process.exit(1)
}

console.log('Dang kiem tra ket noi toi:', supabaseUrl)

const supabase = createClient(supabaseUrl, supabaseAnonKey)
const { error } = await supabase.auth.getSession()

if (error) {
  console.error('KET NOI THAT BAI:', error.message)
  process.exit(1)
}

console.log('KET NOI THANH CONG! Supabase da san sang.')
