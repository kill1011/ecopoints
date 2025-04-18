import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
app.use(cors());

export default async function handler(req, res) {
  // Ensure POST request
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password, name } = req.body;

  // Validate input
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }

  // Initialize Supabase client with service role key
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Create user in auth.users
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      email_confirm: true, // Auto-confirm email to match disabled confirmation
    });

    if (authError) {
      console.error('Auth error:', authError);
      return res.status(500).json({ error: authError.message || 'Failed to create auth user' });
    }

    if (!authData.user) {
      console.error('No user created:', authData);
      return res.status(500).json({ error: 'No user created' });
    }

    // Insert into users table
    const isAdmin = email.endsWith('PCCECOPOINTS@ecopoints.com');
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        name,
        points: 0,
        money: 0,
        is_admin: isAdmin,
      });

    if (profileError) {
      console.error('Profile error:', profileError);
      // Optionally delete auth user if profile insert fails
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ error: profileError.message || 'Failed to create user profile' });
    }

    // Generate session for client
    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (sessionError) {
      console.error('Session error:', sessionError);
      return res.status(500).json({ error: sessionError.message || 'Failed to create session' });
    }

    return res.status(200).json({
      user: {
        id: authData.user.id,
        email: authData.user.email,
        name: authData.user.user_metadata.name,
      },
      session: {
        access_token: sessionData.session.access_token,
        expires_at: sessionData.session.expires_at,
      },
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

