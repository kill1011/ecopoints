const Pusher = require('pusher');
const { createClient } = require('@supabase/supabase-js');

// Pusher setup with provided credentials
const pusher = new Pusher({
  appId: '1975965',
  key: '0b19c0609da3c9a06820',
  secret: '542264cd1f75cd43faa9',
  cluster: 'ap2', // Assumed; verify in Pusher Dashboard
  useTLS: true,
});

// Supabase setup
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://welxjeybnoeeusehuoat.supabase.co',
  process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlbHhqZXlibm9lZXVzZWh1b2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQxMTgzNzIsImV4cCI6MjA1OTY5NDM3Mn0.TmkmlnAA1ZmGgwgiFLsKW_zB7APzjFvuo3H9_Om_GCs'
);

export default async function handler(req, res) {
  // Log incoming request for debugging
  console.log(`[Request] ${req.method} ${req.url}`);

  // Normalize path (remove query string)
  const path = req.url.split('?')[0];

  // Health check endpoint
  if (path === '/api/health') {
    if (req.method !== 'GET') {
      console.log('[Health] Method not allowed:', req.method);
      return res.status(405).json({ error: 'Method not allowed' });
    }
    console.log('[Health] Responding with status: OK');
    return res.status(200).json({ status: 'OK', message: 'Backend is running' });
  }

  // Handle /api/detections
  if (path === '/api/detections') {
    if (req.method !== 'POST') {
      console.log('[Detections] Method not allowed:', req.method);
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { material, quantity, device_id, user_id, session_id } = req.body;

    // Validate payload
    if (!material || !quantity || !device_id || !user_id) {
      console.log('[Detections] Missing fields:', { material, quantity, device_id, user_id });
      return res.status(400).json({ error: 'Missing required fields: material, quantity, device_id, user_id' });
    }

    try {
      // Save detection to Supabase
      const { error: dbError } = await supabase
        .from('session_detections')
        .insert([
          {
            session_id: session_id || null,
            user_id,
            material,
            quantity,
            device_id,
            created_at: new Date().toISOString(),
          },
        ]);

      if (dbError) {
        console.error('[Detections] Supabase insert error:', dbError);
        throw new Error(`Failed to save detection: ${dbError.message}`);
      }

      // Broadcast to Pusher
      await pusher.trigger('detections', 'new-detection', {
        material,
        quantity,
        device_id,
        user_id,
        session_id: session_id || null,
        timestamp: new Date().toISOString(),
      });

      console.log('[Detections] Success:', { material, quantity, device_id, user_id, session_id });
      return res.status(201).json({ message: 'Detection saved and broadcasted' });
    } catch (error) {
      console.error('[Detections] Endpoint error:', error);
      return res.status(500).json({ error: `Server error: ${error.message}` });
    }
  }

  // Handle /api/control
  if (path === '/api/control') {
    const { device_id, user_id } = req.method === 'GET' ? req.query : req.body;

    // Validate device_id and user_id
    if (!device_id || !user_id) {
      console.log('[Control] Missing device_id or user_id:', { device_id, user_id });
      return res.status(400).json({ error: 'Missing device_id or user_id' });
    }

    try {
      if (req.method === 'POST') {
        const { command, session_id } = req.body;

        if (!command) {
          console.log('[Control] Missing command:', req.body);
          return res.status(400).json({ error: 'Missing command' });
        }

        // Upsert device control
        const { error: upsertError } = await supabase
          .from('device_control')
          .upsert(
            [
              {
                device_id,
                user_id,
                command,
                session_id: session_id || null,
                updated_at: new Date().toISOString(),
              },
            ],
            {
              onConflict: ['device_id', 'user_id'],
              returning: 'minimal', // Optimize performance
            }
          );

        if (upsertError) {
          console.error('[Control] Supabase upsert error:', upsertError);
          throw new Error(`Failed to save command: ${upsertError.message}`);
        }

        console.log('[Control] Command saved:', { device_id, user_id, command, session_id });
        return res.status(201).json({ message: 'Command saved' });
      }

      if (req.method === 'GET') {
        const { data, error } = await supabase
          .from('device_control')
          .select('command, user_id, session_id')
          .eq('device_id', device_id)
          .eq('user_id', user_id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(); // Handles no rows gracefully

        if (error) {
          console.error('[Control] Supabase select error:', error);
          throw new Error(`Failed to fetch command: ${error.message}`);
        }

        const response = {
          command: data?.command || 'unknown',
          user_id: data?.user_id || user_id,
          session_id: data?.session_id || null,
        };
        console.log('[Control] GET response:', response);
        return res.status(200).json(response);
      }

      console.log('[Control] Method not allowed:', req.method);
      return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
      console.error('[Control] Endpoint error:', error);
      return res.status(500).json({ error: `Server error: ${error.message}` });
    }
  }

  // Fallback for unknown routes
  console.log('[Fallback] Route not found:', path);
  return res.status(404).json({ error: 'Endpoint not found' });
}