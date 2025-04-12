import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import Pusher from 'pusher';
import rateLimit from 'express-rate-limit';

// Load environment variables
dotenv.config();

const app = express();

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://ecopoints-teal.vercel.app',
    'https://ecopoints-api.vercel.app',
    /^https:\/\/ecopoints-.*\.vercel\.app$/,
    /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-API-Key'],
}));

app.use(express.json());

// Rate limiting
const recyclableLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Too many requests, please try again later' },
});
app.use('/api/recyclables', recyclableLimiter);

// Initialize Supabase
let supabase;
try {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('Missing Supabase URL or Key');
  }
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    auth: { persistSession: false },
  });
  console.log('Supabase initialized');
} catch (error) {
  console.error('Supabase init error:', error.message);
  supabase = null;
}

// Initialize Pusher
let pusher;
try {
  if (!process.env.PUSHER_APP_ID || !process.env.PUSHER_KEY || !process.env.PUSHER_SECRET || !process.env.PUSHER_CLUSTER) {
    throw new Error('Missing Pusher credentials');
  }
  pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true,
  });
  console.log('Pusher initialized');
} catch (error) {
  console.error('Pusher init error:', error.message);
  pusher = null;
}

// Routes
app.get('/api/health', async (req, res) => {
  try {
    console.log(`GET /api/health from ${req.ip}`);
    if (!supabase) {
      return res.status(500).json({ status: 'error', message: 'Supabase not initialized' });
    }
    const { data, error } = await supabase.from('device_control').select('device_id').limit(1);
    if (error) throw error;
    res.json({ status: 'ok', supabase: 'connected', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Health error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/control', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ command: 'stop', error: 'Supabase not initialized' });
    }
    const { data, error } = await supabase
      .from('device_control')
      .select('command')
      .eq('device_id', 'esp32-cam-1')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      const { error: insertError } = await supabase
        .from('device_control')
        .insert([{ device_id: 'esp32-cam-1', command: 'stop', updated_at: new Date().toISOString() }]);
      if (insertError) throw insertError;
      return res.json({ command: 'stop' });
    }
    res.json({ command: data.command });
  } catch (error) {
    console.error('Control GET error:', error.message);
    res.status(500).json({ command: 'stop', error: error.message });
  }
});

app.post('/api/control', async (req, res) => {
  const { command, device_id = 'esp32-cam-1' } = req.body;
  try {
    if (!supabase) {
      return res.status(500).json({ message: 'Supabase not initialized' });
    }
    if (!command || !['start', 'stop'].includes(command)) {
      return res.status(400).json({ message: 'Invalid command' });
    }
    const { data, error } = await supabase
      .from('device_control')
      .upsert([{ device_id, command, updated_at: new Date().toISOString() }])
      .select();
    if (error) throw error;
    res.json({ message: `Command ${command} set`, data });
  } catch (error) {
    console.error('Control POST error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/recyclables', async (req, res) => {
  const { material, quantity, device_id } = req.body;
  try {
    if (!supabase) {
      return res.status(500).json({ message: 'Supabase not initialized' });
    }
    if (!material || !quantity || !device_id || !['bottle', 'can'].includes(material)) {
      return res.status(400).json({ message: 'Invalid material, quantity, or device_id' });
    }
    const { data, error } = await supabase
      .from('recyclables')
      .insert([{ material, quantity: parseInt(quantity), device_id, timestamp: new Date().toISOString() }])
      .select();
    if (error) throw error;

    if (pusher) {
      await pusher.trigger('ecopoints', 'detection', {
        material,
        quantity,
        device_id,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json({ message: 'Recyclable stored', data });
  } catch (error) {
    console.error('Recyclables error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Error handling
app.use((req, res) => {
  console.log(`404: ${req.method} ${req.url}`);
  res.status(404).json({ message: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ message: 'Server error', error: err.message });
});

export default app;