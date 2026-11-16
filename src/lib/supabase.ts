import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://bmyewtkobcnmnkhodeyd.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_hnqqyBQslPyFSkb0DmSBgA_P1DoDLUJ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
