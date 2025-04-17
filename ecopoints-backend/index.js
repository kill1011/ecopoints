import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import Pusher from 'pusher';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();

// Initialize Pusher
const pusher = new Pusher({
  appId: '1975965',
  key: '0b19c0609da3c9a06820',
  secret: '542264cd1f75cd43faa9',
  cluster: 'ap1',
});

// Initialize Supabase
const supabase = createClient(
  'https://welxjeybnoeeusehuoat.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlbHhqZXlibm9lZXVzZWh1b2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQxMTgzNzIsImV4cCI6MjA1OTY5NDM3Mn0.TmkmlnAA1ZmGgwgiFLsKW_zB7APzjFvuo3H9_Om_GCs');

// Simplified CORS configuration to allow all origins (temporary for debugging)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json());

// Simple root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'EcoPoints API is running' });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('Health check received from:', req.headers.origin);
  try {
    res.json({ 
      status: 'ok',
      server: 'running',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
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
      process.env.JWT_SECRET,
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

// Signup endpoint
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body;

  try {
    console.log('Starting signup for:', email);

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Create auth user in Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } }
    });

    if (authError) throw authError;

    // Hash password for users table
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user profile
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

// Trigger Pusher endpoint
app.post('/api/trigger-pusher', async (req, res) => {
  const { channel, event, data } = req.body;

  if (!channel || !event || !data) {
    return res.status(400).json({ error: 'Missing channel, event, or data' });
  }

  try {
    // Insert command into Supabase device_control table
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

    // Trigger Pusher event
    await pusher.trigger(channel, event, data);
    res.status(200).json({ message: 'Event triggered and command saved successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Endpoint for ESP32 to fetch the latest command
app.get('/api/get-command', async (req, res) => {
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
  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*'); // Match existing CORS

  // Keep the connection alive by sending a comment every 15 seconds
  const keepAlive = setInterval(() => {
    res.write(':keep-alive\n\n');
  }, 15000);

  // Function to send data to the frontend
  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Initial message to confirm connection
  sendEvent({ message: 'Connected to backend real-time updates' });

  // Poll Supabase for updates in the device_control table
  let lastUpdatedAt = null;
  const pollInterval = setInterval(async () => {
    try {
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

      // Only send updates if the data has changed
      if (lastUpdatedAt !== data.updated_at) {
        lastUpdatedAt = data.updated_at;
        sendEvent({
          status: data.command === 'start-sensing' ? 'sensing' : 'idle',
          sessionId: data.session_id,
          lastUpdated: data.updated_at,
        });
      }
    } catch (error) {
      console.error('Real-time polling error:', error);
      sendEvent({ status: 'error', message: 'Failed to fetch updates' });
    }
  }, 5000); // Poll every 5 seconds

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(pollInterval);
    clearInterval(keepAlive);
    res.end();
  });
});

// Export the app for Vercel serverless deployment
export default app;