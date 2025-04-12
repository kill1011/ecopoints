import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import Pusher from 'pusher';

dotenv.config();

const app = express();

app.use(cors({
  origin: ['http://localhost:3000', 'https://ecopoints-teal.vercel.app'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-API-Key'],
}));
app.use(express.json());

let supabase;
try {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
} catch (error) {
  console.error('Supabase init error:', error.message);
  supabase = null;
}

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true,
});

app.get('/api/health', async (req, res) => {
  try {
    if (!supabase) throw new Error('Supabase not initialized');
    const { data, error } = await supabase.from('device_control').select('device_id').limit(1);
    if (error) throw error;
    res.status(200).json({ status: 'ok', supabase: 'connected', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Health error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/control', async (req, res) => {
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
    console.error('Control GET error:', error.message);
    res.status(500).json({ command: 'stop', error: error.message });
  }
});

app.post('/api/control', async (req, res) => {
  const { command, device_id = 'esp32-cam-1' } = req.body;
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
    console.error('Control POST error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/recyclables', async (req, res) => {
  const { material, quantity, device_id = 'esp32-cam-1' } = req.body;
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

    await pusher.trigger('ecopoints', 'detection', {
      material,
      quantity,
      device_id,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({ message: 'Recyclable stored', data });
  } catch (error) {
    console.error('Recyclables error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.use((req, res) => res.status(404).json({ message: 'Not found' }));
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ message: 'Server error', error: err.message });
});

export default app;