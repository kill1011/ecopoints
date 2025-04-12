import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import Pusher from 'pusher';

dotenv.config();

const app = express();

console.log('Backend initializing...');
console.log('Environment:', {
  SUPABASE_URL: process.env.SUPABASE_URL ? 'Set' : 'Missing',
  SUPABASE_KEY: process.env.SUPABASE_KEY ? 'Set' : 'Missing',
  PUSHER_APP_ID: process.env.PUSHER_APP_ID ? 'Set' : 'Missing',
});

app.use(cors({
  origin: ['http://localhost:5433', 'http://localhost:3000', 'https://ecopoints-teal.vercel.app'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

let supabase;
try {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('Missing Supabase credentials');
  }
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  console.log('Supabase initialized');
} catch (error) {
  console.error('Supabase init error:', error.message);
  supabase = null;
}

let pusher;
try {
  pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID || '1973570',
    key: process.env.PUSHER_KEY || '528b7d374844d8b54864',
    secret: process.env.PUSHER_SECRET || '',
    cluster: process.env.PUSHER_CLUSTER || 'ap1',
    useTLS: true,
  });
  console.log('Pusher initialized');
} catch (error) {
  console.error('Pusher init error:', error.message);
  pusher = null;
}

app.get('/api/health', async (req, res) => {
  console.log('GET /api/health');
  try {
    if (!supabase) throw new Error('Supabase not initialized');
    const { error } = await supabase.from('device_control').select('device_id').limit(1);
    if (error) throw error;
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Health error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/api/control', async (req, res) => {
  const { command, device_id = 'esp32-cam-1' } = req.body;
  console.log('POST /api/control:', { command, device_id });
  try {
    if (!supabase) throw new Error('Supabase not initialized');
    if (!['start', 'stop'].includes(command)) {
      return res.status(400).json({ message: 'Invalid command' });
    }
    const { error } = await supabase
      .from('device_control')
      .upsert([{ device_id, command, updated_at: new Date().toISOString() }]);
    if (error) throw error;
    res.status(200).json({ message: `Command ${command} set` });
  } catch (error) {
    console.error('Control POST error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/recyclables', async (req, res) => {
  const { material, quantity, device_id = 'esp32-cam-1' } = req.body;
  console.log('POST /api/recyclables:', { material, quantity, device_id });
  try {
    if (!supabase) throw new Error('Supabase not initialized');
    if (!material || !quantity) {
      return res.status(400).json({ message: 'Missing material or quantity' });
    }
    const { error } = await supabase
      .from('recyclables')
      .insert([{ material, quantity, device_id, timestamp: new Date().toISOString() }]);
    if (error) throw error;
    if (pusher) {
      await pusher.trigger('ecopoints', 'detection', {
        material,
        quantity,
        device_id,
        timestamp: new Date().toISOString(),
      });
    }
    res.status(201).json({ message: 'Recyclable stored' });
  } catch (error) {
    console.error('Recyclables error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/insert-recyclables', async (req, res) => {
  const { user_id, bottle_quantity, can_quantity, points_earned, money_earned } = req.body;
  console.log('POST /api/insert-recyclables:', { user_id, bottle_quantity, can_quantity });
  try {
    if (!supabase) throw new Error('Supabase not initialized');
    if (!user_id || (!bottle_quantity && !can_quantity)) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const { error } = await supabase
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
      ]);
    if (error) throw error;
    res.status(201).json({ message: 'Session recorded' });
  } catch (error) {
    console.error('Insert recyclables error:', error.message);
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

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Backend running on port ${port}`);
});

export default app;