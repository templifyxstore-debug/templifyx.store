import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vrhtmoovtnslxvqxvmmi.supabase.co/rest/v1/'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyaHRtb292dG5zbHh2cXh2bW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NTEwODcsImV4cCI6MjA4NzIyNzA4N30.mqV74VmW4O4pqX8c4fOtpZX6AoemcVvPsbh9zHEE74w'

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)