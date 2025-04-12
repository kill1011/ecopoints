import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import Pusher from 'pusher';

dotenv.config();

const app = express();

console.log('Initializing backend...');
console.log('Environment variables:', {
  SUPABASE_URL: process.env.SUPABASE_URL,
  PUSHER_APP_ID: process.env.PUSHER_APP_ID,
  PUSHER_KEY: process.env.PUSHER_KEY,
  PUSHER_CLUSTER: process.env.PUSHER_CLUSTER,
});

app.use(cors({
  origin: ['http://localhost:3000', 'https://ecopoints-teal.vercel.app'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());
app.use(express.json());

let supabase;
try {
  console.log('Connecting to Supabase...');
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  console.log('Supabase initialized successfully');
} catch (error) {
  console.error('Supabase init error:', error.message);
  supabase = null;
}

let pusher;
try {
  console.log('Connecting to Pusher...');
  pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID || '1973570',
    key: process.env.PUSHER_KEY || '528b7d374844d8b54864',
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER || 'ap1',
    useTLS: true,
  });
  console.log('Pusher initialized successfully');
} catch (error) {
  console.error('Pusher init error:', error.message);
  pusher = null;
}

app.get('/api/health', async (req, res) => {
  console.log('GET /api/health requested');
  try {
    if (!supabase) throw new Error('Supabase not initialized');
    const { data, error } = await supabase.from('device_control').select('device_id').limit(1);
    if (error) throw error;
    res.status(200).json({ status: 'ok', supabase: 'connected', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('GET /api/health error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/control', async (req, res) => {
  console.log('GET /api/control requested');
  try {
    if (!supabase) throw new Error('Supabase not initialized');
    const { data, error } = await supabase
      .from('device_control')
      .select('command')
      .eq('device_id', 'esp32-cam-1')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      await supabase.from('device_control').insert([{ device_id: 'esp32-cam-1', command: 'stop' }]);
      return res.status(200).json({ command: 'stop' });
    }
    res.status(200).json({ command: data.command });
  } catch (error) {
    console.error('GET /api/control error:', error.message);
    res.status(500).json({ command: 'stop', error: error.message });
  }
});

app.post('/api/control', async (req, res) => {
  const { command, device_id = 'esp32-cam-1' } = req.body;
  console.log('POST /api/control requested:', { command, device_id });
  try {
    if (!supabase) throw new Error('Supabase not initialized');
    if (!['start', 'stop'].includes(command)) {
      return res.status(400).json({ message: 'Invalid command' });
    }
    const { data, error } = await supabase
      .from('device_control')
      .upsert([{ device_id, command, updated_at: new Date().toISOString() }])
      .select();
    if (error) throw error;
    res.status(200).json({ message: `Command ${command} set`, data });
  } catch (error) {
    console.error('POST /api/control error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/recyclables', async (req, res) => {
  const { material, quantity, device_id = 'esp32-cam-1' } = req.body;
  console.log('POST /api/recyclables requested:', { material, quantity, device_id });
  try {
    if (!supabase) throw new Error('Supabase not initialized');
    if (!material || !quantity) {
      return res.status(400).json({ message: 'Missing material or quantity' });
    }
    const { data, error } = await supabase
      .from('recyclables')
      .insert([{ material, quantity, device_id, timestamp: new Date().toISOString() }])
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
    console.error('POST /api/recyclables error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/insert-recyclables', async (req, res) => {
  const { user_id, bottle_quantity, can_quantity, points_earned, money_earned } = req.body;
  console.log('POST /api/insert-recyclables requested:', { user_id, bottle_quantity, can_quantity });
  try {
    if (!supabase) throw new Error('Supabase not initialized');
    if (!user_id || (!bottle_quantity && !can_quantity)) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const { data, error } = await supabase
      .from('recycling_sessions')
      .insert([
        {
          user_id,
          bottle_quantity,
          can_quantity,
          points_earned,
          money_earned,
          timestamp: new Date().toISOString(),
        },
      ])
      .select();
    if (error) throw error;
    res.status(201).json({ message: 'Session recorded', data });
  } catch (error) {
    console.error('POST /api/insert-recyclables error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.use((req, res) => {
  console.log('Not found:', req.method, req.url);
  res.status(404).json({ message: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err.message, err.stack);
  res.status(500).json({ message: 'Server error', error: err.message });
});

export default app;