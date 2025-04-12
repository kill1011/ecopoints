// app.js (partial update)
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';

// Initialize environment variables
dotenv.config();

// Validate environment variables
const requiredEnv = ['SUPABASE_URL', 'SUPABASE_KEY', 'JWT_SECRET', 'ESP32_API_KEY'];
const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length) {
  console.error(`Missing environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

// Initialize Supabase client
let supabase;
try {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    auth: { persistSession: false }
  });
} catch (error) {
  console.error('Supabase client init failed:', error.message);
  process.exit(1);
}

// Create Express application
const app = express();

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://ecopoints-teal.vercel.app',
    /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-API-Key'],
}));

// Middleware to parse JSON
app.use(express.json());

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    console.log(`No token for ${req.method} ${req.url}`);
    return res.status(401).json({ message: 'Token required' });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log(`Invalid token for ${req.method} ${req.url}:`, err.message);
      return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// API key middleware for ESP32
const authenticateESP32 = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.ESP32_API_KEY) {
    console.log(`Invalid API key for ${req.method} ${req.url}`);
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
};

// Routes
app.get('/api/hello', (req, res) => {
  console.log(`GET /api/hello from ${req.headers.origin}`);
  res.json({ message: 'Hello from the backend!' });
});

app.get('/', (req, res) => {
  console.log(`GET / from ${req.headers.origin}`);
  res.json({ message: 'EcoPoints API is running' });
});

app.get('/api/health', async (req, res) => {
  console.log(`GET /api/health from ${req.headers.origin}`);
  try {
    const { data, error } = await supabase
      .from('device_control')
      .select('device_id')
      .limit(1);
    if (error) {
      console.error('Supabase health error:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      return res.status(500).json({ 
        status: 'error', 
        message: 'Supabase issue', 
        error: error.message 
      });
    }
    res.json({
      status: 'ok',
      server: 'running',
      supabase: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health error:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      status: 'error', 
      message: 'Health check failed', 
      error: error.message 
    });
  }
});

app.get('/api/control', authenticateESP32, async (req, res) => {
  try {
    console.log('GET /api/control for esp32-cam-1');
    const { data, error } = await supabase
      .from('device_control')
      .select('command')
      .eq('device_id', 'esp32-cam-1')
      .maybeSingle();

    if (error) {
      console.error('Control query error:', {
        code: error.code,
        message: error.message,
        details: error.details
      });
      return res.status(500).json({ 
        command: 'stop', 
        error: `Query failed: ${error.message}` 
      });
    }

    if (!data) {
      console.log('No control data, initializing...');
      const { error: insertError } = await supabase
        .from('device_control')
        .insert([{ 
          device_id: 'esp32-cam-1', 
          command: 'stop', 
          updated_at: new Date().toISOString() 
        }]);
      if (insertError) {
        console.error('Control insert error:', {
          code: insertError.code,
          message: insertError.message
        });
        return res.status(500).json({ 
          command: 'stop', 
          error: `Init failed: ${insertError.message}` 
        });
      }
      return res.json({ command: 'stop' });
    }

    res.json({ command: data.command });
  } catch (error) {
    console.error('Control error:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      command: 'stop', 
      error: `Server error: ${error.message}` 
    });
  }
});

app.post('/api/control', authenticateToken, async (req, res) => {
  const { command, device_id = 'esp32-cam-1' } = req.body;
  try {
    console.log(`POST /api/control:`, { command, device_id });
    if (!command || !['start', 'stop'].includes(command)) {
      return res.status(400).json({ message: 'Invalid command' });
    }

    const { data, error } = await supabase
      .from('device_control')
      .upsert([
        { device_id, command, updated_at: new Date().toISOString() },
      ])
      .select();

    if (error) {
      console.error('Control upsert error:', {
        code: error.code,
        message: error.message
      });
      return res.status(500).json({ 
        message: 'Failed to update', 
        error: error.message 
      });
    }

    res.json({ 
      message: `Command ${command} set for ${device_id}`, 
      data 
    });
  } catch (error) {
    console.error('Control post error:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
});

app.post('/api/recyclables', authenticateESP32, async (req, res) => {
  const { material, quantity, device_id, user_id } = req.body;
  try {
    console.log(`POST /api/recyclables:`, req.body);
    if (!material || !quantity || !device_id) {
      return res.status(400).json({ message: 'Material, quantity, device_id required' });
    }

    const recyclableData = {
      material,
      quantity: parseInt(quantity),
      device_id,
      timestamp: new Date().toISOString(),
    };

    if (user_id) {
      recyclableData.user_id = user_id;
    }

    const { data, error } = await supabase
      .from('recyclables')
      .insert([recyclableData])
      .select();

    if (error) {
      console.error('Recyclables insert error:', {
        code: error.code,
        message: error.message
      });
      return res.status(500).json({ 
        message: 'Failed to store', 
        error: error.message 
      });
    }

    res.status(201).json({ message: 'Recyclable stored', data });
  } catch (error) {
    console.error('Recyclables error:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
});

app.get('/api/recyclables', authenticateToken, async (req, res) => {
  try {
    console.log(`GET /api/recyclables from ${req.headers.origin}`);
    const { data, error } = await supabase
      .from('recyclables')
      .select('id, material, quantity, device_id, timestamp')
      .eq('device_id', 'esp32-cam-1')
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Recyclables fetch error:', {
        code: error.code,
        message: error.message
      });
      return res.status(500).json({ 
        message: 'Failed to fetch recyclables', 
        error: error.message 
      });
    }

    res.json(data);
  } catch (error) {
    console.error('Recyclables fetch error:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
});

// ... (rest of your routes: /api/user-stats, /api/insert-recyclables, /api/login, /api/auth/signup)

// Error handling
app.use((req, res) => {
  console.log(`404: ${req.method} ${req.url} from ${req.headers.origin}`);
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Global error:', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    origin: req.headers.origin
  });
  res.status(500).json({
    message: 'Server error',
    error: err.message,
  });
});

// Export for Vercel
export default app;