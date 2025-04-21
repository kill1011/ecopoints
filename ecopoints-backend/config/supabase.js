import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://xvxlddakxhircvunyhbt.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2eGxkZGFreGhpcmN2dW55aGJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwMjE2MTIsImV4cCI6MjA2MDU5NzYxMn0.daBvBBLDOngBEgjnz8ijnIWYFEqCh612xG_r_Waxfeo';

export const supabase = createClient(supabaseUrl, supabaseKey);
