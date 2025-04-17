import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const ESP32_SECRET_TOKEN = process.env.ESP32_SECRET_TOKEN;

export default async function handler(req, res) {
  if (req.headers['x-secret-token'] !== ESP32_SECRET_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    const { device_id } = req.query;

    if (!device_id) {
      return res.status(400).json({ error: 'Missing device_id' });
    }

    try {
      const { data: commands, error } = await supabase
        .from('device_commands')
        .select('command, session_id, user_id')
        .eq('device_id', device_id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Supabase GET error:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (commands.length > 0) {
        const { command, session_id, user_id } = commands[0];
        return res.status(200).json({ command, session_id, user_id });
      } else {
        return res.status(200).json({ command: null });
      }
    } catch (err) {
      console.error('GET error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  } else if (req.method === 'POST') {
    const { type, payload } = req.body;

    if (type !== 'detection' || !payload) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const { session_id, user_id, material, quantity } = payload;

    if (!session_id || !user_id || !material || !quantity) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const { error } = await supabase
        .from('session_detections')
        .insert({
          session_id,
          user_id,
          material,
          quantity,
          detected_at: new Date().toISOString()
        });

      if (error) {
        console.error('Supabase POST error:', error);
        return res.status(500).json({ error: 'Failed to log detection' });
      }

      return res.status(200).json({ message: 'Detection logged successfully' });
    } catch (err) {
      console.error('POST error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}