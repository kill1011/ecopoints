import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://xvxlddakxhircvunyhbt.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be provided');
}

const formattedUrl = supabaseUrl.startsWith('https://') 
  ? supabaseUrl 
  : `https://${supabaseUrl.replace(/^(https?:\/\/|http:\/\/)/, '')}`;

export const supabase = createClient(formattedUrl, supabaseKey);

console.log('Supabase URL being used:', formattedUrl);