import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import Pusher from 'pusher';
import rateLimit from 'express-rate-limit';

// Initialize environment variables
dotenv.config();

// Validate environment variables
const requiredEnv = ['SUPABASE_URL', 'SUPABASE_KEY', 'JWT_SECRET', 'PUSHER_APP_ID', 'PUSHER_KEY', 'PUSHER_SECRET', 'PUSHER_CLUSTER'];
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

// Initialize Pusher
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true,
});

// Create Express application
const app = express();

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://ecopoints-teal.vercel.app',
    /^https:\/\/ecopoints-teal-.*\.vercel\.app$/, // Support Vercel preview URLs
    /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}$/ // Support ESP32 local IPs
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
}));

// Middleware to parse JSON
app.use(express.json());

// Rate limiting for /api/recyclables
const recyclableLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit to 100 requests per window
  message: { message: 'Too many requests, please try again later' },
});
app.use('/api/recyclables', recyclableLimiter);

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
    console.error('Health check error:', {
      message: error.message,
      stack: error.stack,
      origin: req.headers.origin
    });
    res.status(500).json({ 
      status: 'error', 
      message: 'Health check failed', 
      error: error.message 
    });
  }
});

app.get('/api/control', async (req, res) => {
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
          updated_at: supabase.raw('CURRENT_TIMESTAMP') 
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
    console.error('Control endpoint error:', {
      message: error.message,
      stack: error.stack,
      origin: req.headers.origin
    });
    res.status(500).json({ 
      command: 'stop', 
      error: `Server error: ${error.message}` 
    });
  }
});

app.post('/api/control', async (req, res) => {
  const { command, device_id = 'esp32-cam-1' } = req.body;
  try {
    console.log(`POST /api/control:`, { command, device_id });
    if (!command || !['start', 'stop'].includes(command)) {
      return res.status(400).json({ message: 'Invalid command' });
    }

    const { data, error } = await supabase
      .from('device_control')
      .upsert([
        { device_id, command, updated_at: supabase.raw('CURRENT_TIMESTAMP') },
      ])
      .select();

    if (error) {
      console.error('Control upsert error:', {
        code: error.code,
        message: error.message
      });
      return res.status(500).json({ 
        message: 'Failed to update command', 
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
      stack: error.stack,
      origin: req.headers.origin
    });
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
});

app.post('/api/recyclables', async (req, res) => {
  const { material, quantity, device_id, user_id } = req.body;
  try {
    console.log(`POST /api/recyclables:`, req.body);
    if (!material || !quantity || !device_id || !['bottle', 'can'].includes(material)) {
      return res.status(400).json({ message: 'Valid material, quantity, and device_id required' });
    }
    if (quantity <= 0 || !Number.isInteger(Number(quantity))) {
      return res.status(400).json({ message: 'Quantity must be a positive integer' });
    }

    const recyclableData = {
      material,
      quantity: parseInt(quantity),
      device_id,
      timestamp: supabase.raw('CURRENT_TIMESTAMP'),
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
        message: error.message,
        details: error.details
      });
      return res.status(500).json({ 
        message: 'Failed to store recyclable data', 
        error: error.message 
      });
    }

    // Trigger Pusher event for real-time frontend update
    try {
      await pusher.trigger('ecopoints', 'detection', {
        material,
        quantity: parseInt(quantity),
        device_id,
        timestamp: new Date().toISOString(),
      });
      console.log('Pusher event triggered:', { material, quantity, device_id });
    } catch (pusherError) {
      console.error('Pusher trigger error:', {
        message: pusherError.message,
        stack: pusherError.stack
      });
      // Don't fail the request if Pusher fails
    }

    res.status(201).json({ message: 'Recyclable stored', data });
  } catch (error) {
    console.error('Recyclables endpoint error:', {
      message: error.message,
      stack: error.stack,
      origin: req.headers.origin
    });
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
});

app.get('/api/user-stats/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    console.log(`GET /api/user-stats/${id}`);
    if (req.user.id !== id && !req.user.is_admin) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, points, is_admin')
      .eq('id', id)
      .single();
    if (error || !data) {
      console.error('User stats error:', error?.message);
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(data);
  } catch (error) {
    console.error('User stats endpoint error:', {
      message: error.message,
      stack: error.stack,
      origin: req.headers.origin
    });
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
});

app.post('/api/insert-recyclables', authenticateToken, async (req, res) => {
  const { user_id, bottle_quantity, can_quantity, points_earned, money_earned } = req.body;
  try {
    console.log(`POST /api/insert-recyclables:`, req.body);
    if (!user_id || bottle_quantity == null || can_quantity == null) {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }
    if (req.user.id !== user_id && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    const { data, error } = await supabase
      .from('recycling_sessions')
      .insert([{
        user_id,
        bottle_count: parseInt(bottle_quantity),
        can_count: parseInt(can_quantity),
        points_earned: parseInt(points_earned) || 0,
        money_value: parseFloat(money_earned) || 0,
        created_at: supabase.raw('CURRENT_TIMESTAMP')
      }])
      .select();
    if (error) {
      console.error('Insert recyclables error:', {
        code: error.code,
        message: error.message
      });
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to save session', 
        error: error.message 
      });
    }
    const { error: updateError } = await supabase
      .from('users')
      .update({ points: supabase.raw('points + ?', [parseInt(points_earned) || 0]) })
      .eq('id', user_id);
    if (updateError) {
      console.error('Update points error:', {
        code: updateError.code,
        message: updateError.message
      });
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to update user points', 
        error: updateError.message 
      });
    }
    res.status(201).json({ 
      success: true, 
      message: 'Recyclables added', 
      data 
    });
  } catch (error) {
    console.error('Insert recyclables endpoint error:', {
      message: error.message,
      stack: error.stack,
      origin: req.headers.origin
    });
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    console.log(`POST /api/login: ${email}`);
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }
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

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_admin: user.is_admin,
      },
    });
  } catch (error) {
    console.error('Login endpoint error:', {
      message: error.message,
      stack: error.stack,
      origin: req.headers.origin
    });
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body;
  try {
    console.log(`POST /api/auth/signup: ${email}`);
    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Email, password, and name required' });
    }
    const { data: existingUser } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single();

    if (existingUser) {
      console.log('Signup failed: Email exists');
      return res.status(400).json({ message: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{
        id: supabase.raw('gen_random_uuid()'),
        email,
        name,
        password: hashedPassword,
        points: 0,
        money: 0,
        is_admin: false,
      }])
      .select()
      .single();

    if (insertError) {
      console.error('Signup insert error:', {
        code: insertError.code,
        message: insertError.message
      });
      return res.status(500).json({ 
        message: 'Registration failed', 
        error: insertError.message 
      });
    }

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
      },
    });
  } catch (error) {
    console.error('Signup endpoint error:', {
      message: error.message,
      stack: error.stack,
      origin: req.headers.origin
    });
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
});

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