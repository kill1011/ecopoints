import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { supabase } from './config/supabase.js';

// Initialize environment variables
dotenv.config();

// Create Express application
const app = express();

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://ecopoints-teal.vercel.app',
    'http://192.168.0.0/16', // Allow ESP32-CAM local IPs
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
}));

// Middleware to parse JSON request bodies
app.use(express.json());

// API Routes
// Hello endpoint
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from the backend!' });
});

// Root endpoint
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
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Control endpoint for ESP32-CAM (start/stop commands)
app.get('/api/control', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('device_control')
      .select('command')
      .eq('device_id', 'esp32-cam-1') // Adjust device_id as needed
      .single();

    if (error || !data) {
      return res.json({ command: 'stop' }); // Default to stop
    }

    res.json({ command: data.command });
  } catch (error) {
    console.error('Control endpoint error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update control command (for frontend/admin to set start/stop)
app.post('/api/control', async (req, res) => {
  const { command, device_id = 'esp32-cam-1' } = req.body;

  if (!['start', 'stop'].includes(command)) {
    return res.status(400).json({ message: 'Invalid command' });
  }

  try {
    const { error } = await supabase
      .from('device_control')
      .upsert([
        { device_id, command, updated_at: new Date().toISOString() },
      ]);

    if (error) {
      console.error('Control update error:', error);
      return res.status(500).json({ message: 'Failed to update command' });
    }

    res.json({ message: `Command ${command} set for device ${device_id}` });
  } catch (error) {
    console.error('Control post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Recyclables endpoint for ESP32-CAM
app.post('/api/recyclables', async (req, res) => {
  const { material, quantity } = req.body;

  try {
    if (!material || !quantity) {
      return res.status(400).json({ message: 'Material and quantity required' });
    }

    const { data, error } = await supabase
      .from('recyclables')
      .insert([{ material, quantity, timestamp: new Date().toISOString() }]);

    if (error) {
      console.error('Recyclables storage error:', error);
      return res.status(500).json({ message: 'Failed to store recyclable data' });
    }

    res.status(201).json({ message: 'Recyclable data stored', data });
  } catch (error) {
    console.error('Recyclables endpoint error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Authentication Routes
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
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
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body;

  try {
    const { data: existingUser } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (authError) throw authError;

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

    if (profileError) throw profileError;

    res.status(201).json({
      message: 'Registration successful!',
      user: authData.user,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
});

// Error handling middleware
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({
    message: 'Internal server error',
    error: err.message,
  });
});

// Export for Vercel
export default app;