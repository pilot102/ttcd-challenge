import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ppujxvhvmwmsuqtxdcge.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_LJrHu7Lwme6U56em0R8g4g_kebPGbcF'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
