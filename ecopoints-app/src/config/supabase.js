import { createClient } from '@supabase/supabase-js';

// Ensure the URL always has the proper https:// prefix
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://xvxlddakxhircvunyhbt.supabase.co';
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Create the Supabase client with the properly formatted URL
export const supabase = createClient(supabaseUrl, supabaseKey);

