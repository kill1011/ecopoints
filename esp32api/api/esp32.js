const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://welxjeybnoeeusehuoat.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlbHhqZXlibm9lZXVzZWh1b2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQxMTgzNzIsImV4cCI6MjA1OTY5NDM3Mn0.TmkmlnAA1ZmGgwgiFLsKW_zB7APzjFvuo3H9_Om_GCs';
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  const { method, body, query } = req;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (method === 'POST') {
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid or missing request body' });
    }

    const { type, command, payload } = body;

    if (!type) {
      return res.status(400).json({ error: 'Missing request type' });
    }

    if (type === 'command') {
      if (!command || !payload || !payload.device_id || !payload.user_id || !payload.session_id || !payload.secret_token) {
        return res.status(400).json({ error: 'Missing required fields in command payload' });
      }

      if (payload.secret_token !== process.env.ESP32_SECRET_TOKEN) {
        return res.status(403).json({ error: 'Invalid secret token' });
      }

      try {
        const { error } = await supabase
          .from('device_commands')
          .insert([
            {
              device_id: payload.device_id,
              user_id: payload.user_id,
              session_id: payload.session_id,
              command: command,
              created_at: new Date().toISOString(),
            },
          ]);

        if (error) {
          console.error('Supabase insert error (command):', error);
          return res.status(500).json({ error: 'Failed to store command', details: error.message });
        }

        res.status(200).json({ message: `Command ${command} stored successfully` });
      } catch (error) {
        console.error('Unexpected error storing command:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    } else if (type === 'detection') {
      if (!payload || !payload.session_id || !payload.user_id || !payload.material || !payload.quantity) {
        return res.status(400).json({ error: 'Missing required fields in detection payload' });
      }

      try {
        const { error } = await supabase
          .from('session_detections')
          .insert([
            {
              session_id: payload.session_id,
              user_id: payload.user_id,
              material: payload.material,
              quantity: payload.quantity,
              created_at: new Date().toISOString(),
            },
          ]);

        if (error) {
          console.error('Supabase insert error (detection):', error);
          return res.status(500).json({ error: 'Failed to store detection', details: error.message });
        }

        res.status(200).json({ message: 'Detection stored successfully' });
      } catch (error) {
        console.error('Unexpected error storing detection:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    } else {
      res.status(400).json({ error: 'Invalid request type' });
    }
  } else if (method === 'GET') {
    const { device_id } = query;

    if (!device_id) {
      return res.status(400).json({ error: 'Missing device_id query parameter' });
    }

    try {
      const { data, error } = await supabase
        .from('device_commands')
        .select('command, session_id, user_id')
        .eq('device_id', device_id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Supabase fetch error (command):', error);
        return res.status(500).json({ error: 'Failed to fetch command', details: error.message });
      }

      if (data && data.length > 0) {
        const { error: deleteError } = await supabase
          .from('device_commands')
          .delete()
          .eq('device_id', device_id)
          .eq('session_id', data[0].session_id);

        if (deleteError) {
          console.error('Supabase delete error (command):', deleteError);
          return res.status(500).json({ error: 'Failed to delete command', details: deleteError.message });
        }

        res.status(200).json(data[0]);
      } else {
        res.status(204).json({});
      }
    } catch (error) {
      console.error('Unexpected error fetching command:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
    res.status(405).json({ error: `Method ${method} Not Allowed` });
  }
};