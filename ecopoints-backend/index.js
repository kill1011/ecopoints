import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { supabase } from './config/supabase.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// CORS configuration
app.use(cors({
  origin: ['https://ecopoints-teal.vercel.app', 'http://localhost:5433'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.options('*', cors());

app.use(express.json());

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
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    console.log('Login attempt for:', email);
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      console.log('Login failed:', authError?.message || 'User not found');
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, name, email, is_admin')
      .eq('id', authData.user.id)
      .single();

    if (userError || !user) {
      console.log('Login failed: User profile not found');
      return res.status(401).json({ message: 'User profile not found' });
    }

    const token = jwt.sign(
      { id: user.id, is_admin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('Login successful for:', email);
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
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Signup endpoint
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body;

  try {
    console.log('Starting signup for:', email);
    const { data: existingUser } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const isAdmin = email.endsWith('PCCECOPOINTS@ecopoints.com');
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } }
    });

    if (authError) throw authError;

    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .insert([{
        id: authData.user.id,
        email: email,
        name: name,
        points: 0,
        money: 0,
        bottles: 0,
        cans: 0,
        is_admin: isAdmin
      }])
      .single();

    if (profileError) throw profileError;

    console.log('Signup successful for:', email);
    res.status(201).json({
      message: authData.session ? 'Registration successful!' : 'Account created! Please verify your email.',
      user: authData.user
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      message: 'Registration failed',
      error: error.message
    });
  }
});

// User stats endpoint
app.get('/api/user-stats/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(401).json({ message: 'Invalid token' });
      }

      if (decoded.id !== userId) {
        return res.status(403).json({ message: 'Unauthorized access' });
      }

      const { data: userData, error } = await supabase
        .from('users')
        .select('points, bottles, cans')
        .eq('id', userId)
        .single();

      if (error) {
        return res.status(500).json({ message: 'Error fetching user stats', error: error.message });
      }

      if (!userData) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json(userData);
    });
  } catch (error) {
    console.error('Error in /api/user-stats:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ 
    message: 'Internal server error',
    error: err.message
  });
});