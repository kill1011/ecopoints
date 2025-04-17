import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import Pusher from 'pusher';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();

// Initialize services with error handling and optional fallback
let pusher = null;
try {
  pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID || '1975965',
    key: process.env.PUSHER_KEY || '0b19c0609da3c9a06820',
    secret: process.env.PUSHER_SECRET || '542264cd1f75cd43faa9', // Replace with full secret or env var
    cluster: process.env.PUSHER_CLUSTER || 'ap1',
  });
  console.log('Pusher initialized successfully');
} catch (error) {
  console.warn('Pusher initialization failed, proceeding without Pusher:', error.message);
  pusher = null; // Allow app to run without Pusher
}

let supabase = null;
try {
  supabase = createClient(
    process.env.SUPABASE_URL || 'https://welxjeybnoeeusehuoat.supabase.co',
    process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlbHxqZXlibm9lZXVzZWh1b2F0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDExODM3MiwiZXhwIjoyMDU5Njk0MzcyfQ.1V5L4-T0T-kv6oZ7s1bzQjZ7Z5eZ7Z5eZ7Z5eZ7Z5eZ'
  );
  console.log('Supabase initialized successfully');
} catch (error) {
  console.warn('Supabase initialization failed, proceeding without Supabase:', error.message);
  supabase = null; // Allow app to run without Supabase
}

// Enhanced custom CORS middleware with logging
app.use((req, res, next) => {
  console.log(`CORS Middleware - Request: ${req.method} ${req.url}, Origin: ${req.headers.origin}`);
  res.setHeader('Access-Control-Allow-Origin', 'https://ecopoints-teal.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    return res.status(204).send();
  }
  next();
});

app.use(express.json());

// Health check endpoint to confirm server status
app.get('/api/health', (req, res) => {
  console.log('Health check received from:', req.headers.origin);
  try {
    const healthStatus = {
      status: 'ok',
      server: 'running',
      timestamp: new Date().toISOString(),
      pusher: pusher ? 'available' : 'unavailable',
      supabase: supabase ? 'available' : 'unavailable',
    };
    res.json(healthStatus);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Login endpoint (only if Supabase is available)
app.post('/api/login', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ message: 'Supabase service unavailable' });
  }
  const { email, password } = req.body;
  
  try {
    console.log('Login attempt for:', email);

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      console.log('Login failed: User not found');
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('Login failed: Invalid password');
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, is_admin: user.is_admin },
      process.env.JWT_SECRET || 'qCspgluLFqmeaL+pWy5ALCnkZIqbRm5UV/AIHEf0SCnugmX63Umtgo6MyXsoX9F/JDJOrZSlNn/9XU1nFdnnIw==',
      { expiresIn: '24h' }
    );

    console.log('Login successful for:', email);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_admin: user.is_admin
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Signup endpoint (only if Supabase is available)
app.post('/api/auth/signup', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ message: 'Supabase service unavailable' });
  }
  const { email, password, name } = req.body;

  try {
    console.log('Starting signup for:', email);

    const { data: existingUser } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } }
    });

    if (authError) throw authError;

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .insert([{
        id: authData.user.id,
        email: email,
        name: name,
        password: hashedPassword,
        points: 0,
        money: 0,
        is_admin: false
      }])
      .single();

    if (profileError) throw profileError;

    console.log('Signup successful for:', email);
    res.status(201).json({
      message: 'Registration successful!',
      user: authData.user
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      message: 'Registration failed',
      error: error.message
    });
  }
});

// Trigger Pusher endpoint (only if Pusher is available)
app.post('/api/trigger-pusher', async (req, res) => {
  if (!pusher) {
    return res.status(503).json({ message: 'Pusher service unavailable' });
  }
  const { channel, event, data } = req.body;

  if (!channel || !event || !data) {
    return res.status(400).json({ error: 'Missing channel, event, or data' });
  }

  try {
    if (supabase) {
      const { error: dbError } = await supabase
        .from('device_control')
        .upsert(
          {
            device_id: data.device_id,
            user_id: data.user_id,
            command: data.command,
            session_id: data.session_id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: ['device_id', 'user_id'] }
        );
      if (dbError) throw dbError;
    }

    await pusher.trigger(channel, event, data);
    res.status(200).json({ message: 'Event triggered and command saved successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Endpoint for ESP32 to fetch the latest command (only if Supabase is available)
app.get('/api/get-command', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ message: 'Supabase service unavailable' });
  }
  const { device_id, user_id } = req.query;

  if (!device_id || !user_id) {
    return res.status(400).json({ error: 'Missing device_id or user_id' });
  }

  try {
    const { data, error } = await supabase
      .from('device_control')
      .select('command, session_id, updated_at')
      .eq('device_id', device_id)
      .eq('user_id', user_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'No command found' });
    }

    res.status(200).json({
      command: data.command,
      session_id: data.session_id,
      updated_at: data.updated_at
    });
  } catch (error) {
    console.error('Error fetching command:', error);
    res.status(500).json({ error: 'Failed to fetch command' });
  }
});

// Error handling for unhandled routes
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ 
    message: 'Internal server error',
    error: err.message
  });
});

// NEW: Add Server-Sent Events (SSE) endpoint for backend-to-frontend connection
app.get('/api/realtime', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', 'https://ecopoints-teal.vercel.app');

  const keepAlive = setInterval(() => {
    res.write(':keep-alive\n\n');
  }, 15000);

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent({ message: 'Connected to backend real-time updates' });

  let lastUpdatedAt = null;
  const pollInterval = setInterval(async () => {
    try {
      if (supabase) {
        const { device_id = 'esp32-cam-1', user_id = 'test-user' } = req.query;
        const { data, error } = await supabase
          .from('device_control')
          .select('command, session_id, updated_at')
          .eq('device_id', device_id)
          .eq('user_id', user_id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();

        if (error || !data) {
          sendEvent({ status: 'idle', message: 'No active command', lastUpdated: new Date().toISOString() });
          return;
        }

        if (lastUpdatedAt !== data.updated_at) {
          lastUpdatedAt = data.updated_at;
          sendEvent({
            status: data.command === 'start-sensing' ? 'sensing' : 'idle',
            sessionId: data.session_id,
            lastUpdated: data.updated_at,
          });
        }
      } else {
        sendEvent({ status: 'idle', message: 'Supabase unavailable' });
      }
    } catch (error) {
      console.error('Real-time polling error:', error);
      sendEvent({ status: 'error', message: 'Failed to fetch updates' });
    }
  }, 5000);

  req.on('close', () => {
    clearInterval(pollInterval);
    clearInterval(keepAlive);
    res.end();
  });
});

export default app;