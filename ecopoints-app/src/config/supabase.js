import { createClient } from '@supabase/supabase-js';

// Ensure the URL always has the proper https:// prefix
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://xvxlddakxhircvunyhbt.supabase.co';
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Create a properly formatted URL by ensuring it starts with https://
const formattedUrl = supabaseUrl.startsWith('https://') 
  ? supabaseUrl 
  : `https://${supabaseUrl.replace(/^(https?:\/\/|https:\/\/)/, '')}`;

// Create the Supabase client with the properly formatted URL
export const supabase = createClient(formattedUrl, supabaseKey);

// Log the URL being used (for debugging)
console.log('Supabase URL being used:', formattedUrl);