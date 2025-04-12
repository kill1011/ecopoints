import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';

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
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Create Express application
const app = express();

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://ecopoints-teal.vercel.app',
    'http://192.168.0.0/16', // ESP32-CAM local IPs
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
}));

// Middleware to parse JSON request bodies
app.use(express.json());

// API Routes
app.get('/api/hello', (req, res) => {
  console.log('GET /api/hello');
  res.json({ message: 'Hello from the backend!' });
});

app.get('/', (req, res) => {
  console.log('GET /');
  res.json({ message: 'EcoPoints API is running' });
});

app.get('/api/health', async (req, res) => {
  console.log('GET /api/health from:', req.headers.origin);
  try {
    const { data, error } = await supabase.from('device_control').select('device_id').limit(1);
    if (error) {
      console.error('Supabase health check failed:', error.message, error.details);
      return res.status(500).json({ status: 'error', message: 'Supabase connection issue', error: error.message });
    }
    res.json({
      status: 'ok',
      server: 'running',
      supabase: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check error:', error.message, error.stack);
    res.status(500).json({ status: 'error', message: 'Health check failed', error: error.message });
  }
});

app.get('/api/debug', (req, res) => {
  console.log('GET /api/debug');
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
    // Temporary static response to bypass Supabase issues
    // Uncomment Supabase code once verified
    /*
    const { data, error } = await supabase
      .from('device_control')
      .select('command')
      .eq('device_id', 'esp32-cam-1')
      .maybeSingle();

    if (error) {
      console.error('Supabase query error:', error.message, error.details, error.hint);
      return res.json({ command: 'stop', warning: 'Supabase query failed' });
    }

    if (!data) {
      console.log('No control data found');
      const { error: insertError } = await supabase
        .from('device_control')
        .insert([{ device_id: 'esp32-cam-1', command: 'stop', updated_at: new Date().toISOString() }]);
      if (insertError) {
        console.error('Insert error:', insertError.message);
        return res.json({ command: 'stop', warning: 'Failed to initialize device_control' });
      }
      return res.json({ command: 'stop' });
    }

    console.log('Control data:', data);
    return res.json({ command: data.command });
    */
    // Static response for now
    res.json({ command: 'stop', note: 'Static response until Supabase is fixed' });
  } catch (error) {
    console.error('Control endpoint error:', error.message, error.stack);
    res.json({ command: 'stop', error: 'Unexpected server error' });
  }
});

app.post('/api/control', async (req, res) => {
  const { command, device_id = 'esp32-cam-1' } = req.body;

  try {
    console.log('POST /api/control:', { command, device_id });
    if (!['start', 'stop'].includes(command)) {
      return res.status(400).json({ message: 'Invalid command' });
    }

    const { error } = await supabase
      .from('device_control')
      .upsert([
        { device_id, command, updated_at: new Date().toISOString() },
      ]);

    if (error) {
      console.error('Control update error:', error.message, error.details);
      return res.status(500).json({ message: 'Failed to update command', error: error.message });
    }

    res.json({ message: `Command ${command} set for device ${device_id}` });
  } catch (error) {
    console.error('Control post error:', error.message, error.stack);
    res.status(500).json({ message: 'Server error in control post' });
  }
});

app.post('/api/recyclables', async (req, res) => {
  const { material, quantity, device_id, user_id } = req.body;

  try {
    console.log('POST /api/recyclables:', req.body);
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
      console.error('Recyclables insert error:', error.message, error.details);
      return res.status(500).json({ message: 'Failed to store recyclable data', error: error.message });
    }

    res.status(201).json({ message: 'Recyclable data stored', data });
  } catch (error) {
    console.error('Recyclables endpoint error:', error.message, error.stack);
    res.status(500).json({ message: 'Server error in recyclables endpoint' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    console.log('POST /api/login:', email);
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
    console.error('Login error:', error.message, error.stack);
    res.status(500).json({ message: 'Server error during login' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body;

  try {
    console.log('POST /api/auth/signup:', email);
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
      options: { data: { name } },
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
        is_admin: false,
      }]);

    if (profileError) {
      console.error('Profile insert error:', profileError.message);
      throw profileError;
    }

    res.status(201).json({
      message: 'Registration successful!',
      user: authData.user,
    });
  } catch (error) {
    console.error('Registration error:', error.message, error.stack);
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
});

// Error handling middleware
app.use((req, res) => {
  console.log('404:', req.method, req.url);
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Global error:', err.message, err.stack);
  res.status(500).json({
    message: 'A server error has occurred',
    error: err.message,
  });
});

// Export for Vercel
export default app;