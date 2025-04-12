import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import { WebSocketServer } from 'ws';

dotenv.config();

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_KEY', 'JWT_SECRET'];
const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length) {
  console.error(`Missing environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://ecopoints-teal.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Token required' });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

app.get('/api/hello', (req, res) => {
  console.log('GET /api/hello from:', req.headers.origin);
  res.json({ message: 'Hello from the backend!' });
});

app.get('/api/health', async (req, res) => {
  console.log('GET /api/health from:', req.headers.origin);
  try {
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error) {
      console.error('Supabase health error:', error.message);
      return res.status(500).json({ status: 'error', message: 'Supabase connection issue' });
    }
    res.json({
      status: 'ok',
      server: 'running',
      supabase: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check error:', error.message);
    res.status(500).json({ status: 'error', message: 'Health check failed' });
  }
});

app.get('/api/user-stats/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  console.log(`GET /api/user-stats/${id} from:`, req.headers.origin);
  try {
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
    console.error('User stats error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/insert-recyclables', authenticateToken, async (req, res) => {
  const { user_id, bottle_quantity, can_quantity, points_earned, money_earned } = req.body;
  console.log('POST /api/insert-recyclables:', req.body);
  try {
    if (!user_id || typeof bottle_quantity !== 'number' || typeof can_quantity !== 'number') {
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
      console.error('Insert recyclables error:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to save session' });
    }
    const { error: updateError } = await supabase
      .from('users')
      .update({ points: supabase.raw('points + ?', [points_earned]) })
      .eq('id', user_id);
    if (updateError) {
      console.error('Update user error:', updateError.message);
      return res.status(500).json({ success: false, message: 'Failed to update user points' });
    }
    res.status(201).json({ success: true, message: 'Recyclables added', data });
  } catch (error) {
    console.error('Insert recyclables error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/recyclables', async (req, res) => {
  const { material, quantity, device_id } = req.body;
  console.log('POST /api/recyclables:', req.body);
  try {
    if (!material || !quantity || !device_id) {
      return res.status(400).json({ message: 'Material, quantity, and device_id required' });
    }
    const { data, error } = await supabase
      .from('recyclables')
      .insert([{
        material,
        quantity,
        device_id,
        timestamp: new Date().toISOString()
      }])
      .select();
    if (error) {
      console.error('Recyclables error:', error.message);
      return res.status(500).json({ message: 'Failed to store recyclable data' });
    }
    // Broadcast to WebSocket clients
    wss.clients.forEach(client => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({ type: 'detection', material, quantity }));
      }
    });
    res.status(201).json({ message: 'Recyclable data stored', data });
  } catch (error) {
    console.error('Recyclables error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('POST /api/login:', email);
  try {
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
        is_admin: user.is_admin
      }
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error during login' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body;
  console.log('POST /api/auth/signup:', email);
  try {
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
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } }
    });
    if (authError) {
      console.error('Auth signup error:', authError.message);
      throw authError;
    }
    const { error: profileError } = await supabase
      .from('users')
      .insert([{
        id: authData.user.id,
        email,
        name,
        password: hashedPassword,
        points: 0,
        money: 0,
        is_admin: false
      }]);
    if (profileError) {
      console.error('Profile insert error:', profileError.message);
      throw profileError;
    }
    res.status(201).json({
      message: 'Registration successful!',
      user: authData.user
    });
  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
});

// WebSocket setup
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Fallback for Vercel serverless (optional)
app.get('/ws', (req, res) => {
  res.status(200).send('WebSocket endpoint');
});

app.use((req, res) => {
  console.log('404:', req.method, req.url);
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Global error:', err.message, err.stack);
  res.status(500).json({
    message: 'A server error has occurred',
    error: err.message
  });
});

export default app;