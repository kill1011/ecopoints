import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import { WebSocketServer } from 'ws';

// Initialize environment variables
dotenv.config();

// Validate environment variables
const requiredEnv = ['SUPABASE_URL', 'SUPABASE_KEY', 'JWT_SECRET'];
const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length) {
  console.error(`Missing environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

// Initialize Supabase client
let supabase;
try {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
} catch (error) {
  console.error('Supabase client initialization failed:', error.message);
  process.exit(1);
}

// Create Express application
const app = express();

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://ecopoints-teal.vercel.app',
    /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}$/ // ESP32-CAM IPs
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
}));

// Middleware to parse JSON request bodies
app.use(express.json());

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    console.log(`No token provided for ${req.method} ${req.url}`);
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

// API Routes
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
        message: 'Supabase connection issue', 
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
      stack: error.stack
    });
    res.status(500).json({ 
      status: 'error', 
      message: 'Health check failed', 
      error: error.message 
    });
  }
});

app.get('/api/debug', (req, res) => {
  console.log(`GET /api/debug from ${req.headers.origin}`);
  res.json({
    message: 'Debug endpoint',
    env: {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_KEY: !!process.env.SUPABASE_KEY,
      JWT_SECRET: !!process.env.JWT_SECRET,
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/control', async (req, res) => {
  try {
    console.log('GET /api/control for device_id: esp32-cam-1');
    const { data, error } = await supabase
      .from('device_control')
      .select('command')
      .eq('device_id', 'esp32-cam-1')
      .maybeSingle();

    if (error) {
      console.error('Supabase control query error:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      return res.status(500).json({ 
        command: 'stop', 
        error: `Supabase query failed: ${error.message}` 
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
          message: insertError.message,
          details: insertError.details
        });
        return res.status(500).json({ 
          command: 'stop', 
          error: `Failed to initialize device_control: ${insertError.message}` 
        });
      }
      return res.json({ command: 'stop' });
    }

    console.log('Control data:', data);
    res.json({ command: data.command });
  } catch (error) {
    console.error('Control endpoint error:', {
      message: error.message,
      stack: error.stack
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
      return res.status(400).json({ message: 'Invalid or missing command' });
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
        message: error.message,
        details: error.details
      });
      return res.status(500).json({ 
        message: 'Failed to update command', 
        error: error.message 
      });
    }

    res.json({ 
      message: `Command ${command} set for device ${device_id}`, 
      data 
    });
  } catch (error) {
    console.error('Control post error:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      message: 'Server error in control post', 
      error: error.message 
    });
  }
});

app.post('/api/recyclables', async (req, res) => {
  const { material, quantity, device_id, user_id } = req.body;
  try {
    console.log(`POST /api/recyclables:`, req.body);
    if (!material || !quantity || !device_id) {
      return res.status(400).json({ message: 'Material, quantity, and device_id are required' });
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
        message: error.message,
        details: error.details
      });
      return res.status(500).json({ 
        message: 'Failed to store recyclable data', 
        error: error.message 
      });
    }

    // Broadcast to WebSocket clients
    wss.clients.forEach(client => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({ type: 'detection', material, quantity }));
      }
    });

    res.status(201).json({ message: 'Recyclable data stored', data });
  } catch (error) {
    console.error('Recyclables endpoint error:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      message: 'Server error in recyclables endpoint', 
      error: error.message 
    });
  }
});

app.get('/api/user-stats/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    console.log(`GET /api/user-stats/${id} from ${req.headers.origin}`);
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
    console.error('User stats error:', {
      message: error.message,
      stack: error.stack
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
        bottle_count: bottle_quantity,
        can_count: can_quantity,
        points_earned,
        money_value: money_earned,
        created_at: new Date().toISOString()
      }])
      .select();
    if (error) {
      console.error('Insert recyclables error:', {
        code: error.code,
        message: error.message,
        details: error.details
      });
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to save session', 
        error: error.message 
      });
    }
    const { error: updateError } = await supabase
      .from('users')
      .update({ points: supabase.raw('points + ?', [points_earned]) })
      .eq('id', user_id);
    if (updateError) {
      console.error('Update user points error:', {
        code: updateError.code,
        message: updateError.message,
        details: updateError.details
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
    console.error('Insert recyclables error:', {
      message: error.message,
      stack: error.stack
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
    console.error('Login error:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      message: 'Server error during login', 
      error: error.message 
    });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body;
  try {
    console.log(`POST /api/auth/signup: ${email}`);
    const { data: existingUser } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single();

    if (existingUser) {
      console.log('Signup failed: Email already registered');
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
        message: insertError.message,
        details: insertError.details
      });
      return res.status(500).json({ 
        message: 'Registration failed', 
        error: insertError.message 
      });
    }

    res.status(201).json({
      message: 'Registration successful!',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
      },
    });
  } catch (error) {
    console.error('Signup error:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      message: 'Server error during signup', 
      error: error.message 
    });
  }
});

// Error handling middleware
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
    message: 'A server error has occurred',
    error: err.message,
  });
});

// WebSocket setup
const server = app.listen(0); // Vercel assigns port
const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });
});

// Export for Vercel
export default app;