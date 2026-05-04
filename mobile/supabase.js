import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yvlpnshfqwkpcftotltb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_T-6WKjVuIV0jMBdcHvwUSA_-cPKmEao';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);