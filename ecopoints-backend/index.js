import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { supabase } from './config/supabase.js';

dotenv.config();

const app = express();

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://ecopoints-teal.vercel.app/' // Update with your actual frontend URL if deployed
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json());

// Hello endpoint
app.get('/api/hello', (req, res) => {
  res.json({ message: "Hello from the backend!" });
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
      options: { data: { name } }
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
        is_admin: false
      }]);

    if (profileError) throw profileError;

    res.status(201).json({
      message: 'Registration successful!',
      user: authData.user
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
    error: err.message
  });
});

// Export the app for Vercel
export default app;

// Optional: Local development server
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}