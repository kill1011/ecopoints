import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import Pusher from 'pusher';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();

const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID || '1975965',
    key: process.env.PUSHER_KEY || '0b19c0609da3c9a06820',
    secret: process.env.PUSHER_SECRET || '542264cd1f75cd43faa9',
    cluster: process.env.PUSHER_CLUSTER || 'ap1',
});

const supabase = createClient(
    process.env.SUPABASE_URL || 'https://welxjeybnoeeusehuoat.supabase.co',
    process.env.SUPABASE_KEY || 'your-actual-service-role-key'
);

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'EcoPoints API is running' });
});

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

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        console.log('Login attempt for:', email);
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
            process.env.JWT_SECRET || 'default-secret',
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
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { name } }
        });
        if (authError) throw authError;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const { data: profileData, error: profileError } = await supabase
            .from('users')
            .insert([{
                id: authData.user.id,
                email: email,
                name: name,
                password: hashedPassword,
                points: 0,
                money: 0,
                is_admin: false
            }])
            .single();
        if (profileError) throw profileError;
        console.log('Signup successful for:', email);
        res.status(201).json({
            message: 'Registration successful!',
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

app.post('/api/trigger-pusher', async (req, res) => {
    const { channel, event, data } = req.body;
    console.log('Received trigger-pusher request:', { channel, event, data });
    if (!channel || !event || !data) {
        console.warn('Missing channel, event, or data in trigger-pusher request');
        return res.status(400).json({ error: 'Missing channel, event, or data' });
    }
    try {
        const { error: dbError } = await supabase
            .from('device_control')
            .upsert(
                {
                    device_id: data.device_id,
                    user_id: data.user_id,
                    command: data.command,
                    session_id: data.session_id,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: ['device_id', 'user_id'] }
            );
        if (dbError) throw dbError;
        await pusher.trigger(channel, event, data);
        console.log('Pusher event triggered:', { channel, event, data });
        res.status(200).json({ message: 'Event triggered and command saved successfully' });
    } catch (error) {
        console.error('Error in trigger-pusher:', error);
        res.status(500).json({ error: 'Failed to process request', details: error.message });
    }
});

app.get('/api/get-command', async (req, res) => {
    const { device_id, user_id } = req.query;
    console.log('Received get-command request:', { device_id, user_id, origin: req.headers.origin });
    if (!device_id || !user_id) {
        console.warn('Missing device_id or user_id in get-command request');
        return res.status(400).json({ error: 'Missing device_id or user_id' });
    }
    try {
        const { data, error } = await supabase
            .from('device_control')
            .select('command, session_id, updated_at')
            .eq('device_id', device_id)
            .eq('user_id', user_id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();
        console.log('Supabase query result:', { data, error });
        if (error) {
            console.warn('Supabase error:', error.message);
            return res.status(404).json({ error: 'No command found', details: error.message });
        }
        if (!data) {
            console.warn('No command found for:', { device_id, user_id });
            return res.status(404).json({ error: 'No command found' });
        }
        console.log('Returning command:', { command: data.command, session_id: data.session_id });
        res.status(200).json({
            command: data.command,
            session_id: data.session_id,
            updated_at: data.updated_at,
        });
    } catch (error) {
        console.error('Error fetching command:', error);
        res.status(500).json({ error: 'Failed to fetch command', details: error.message });
    }
});

app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
    console.error('Global error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        details: err.message
    });
});

export default app;