import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cozvmqbfhcczsvhhdhot.supabase.co';
const supabaseAnonKey = 'sb_publishable_m2gzKrc8x9voyIQXSZSBmA_3fhwDPFu'; // Pega no dashboard

export const supabase = createClient(supabaseUrl, supabaseAnonKey);