import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop, faHistory, faList } from '@fortawesome/free-solid-svg-icons';
import { createClient } from '@supabase/supabase-js';
import '../styles/Insert.css';

const supabaseUrl = "https://welxjeybnoeeusehuoat.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlbHhqZXlibm9lZXVzZWh1b2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQxMTgzNzIsImV4cCI6MjA1OTY5NDM3Mn0.TmkmlnAA1ZmGgwgiFLsKW_zB7APzjFvuo3H9_Om_GCs";
const supabase = createClient(supabaseUrl, supabaseKey);

const Insert = () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [userData] = useState({
    name: user.name || 'Guest',
    points: user.points || 0,
    id: user.id || null,
  });
  const [alert, setAlert] = useState({ type: '', message: '' });
  const [systemStatus, setSystemStatus] = useState('Idle');
  const [isSensing, setIsSensing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [detections, setDetections] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    console.log('[Insert.jsx] Mounting');
    const refreshSchema = async () => {
      try {
        await Promise.all([
          supabase.from('device_control').select('id').limit(1),
          supabase.from('recyclables').select('id').limit(1),
          supabase.from('recycling_sessions').select('id').limit(1),
        ]);
        console.log('[Insert.jsx] Schema refreshed');
      } catch (error) {
        console.error('[Insert.jsx] Schema refresh error:', error);
        setDbError(true);
        setAlert({
          type: 'error',
          message: 'Failed to refresh database schema. Check console for details.',
        });
      }
    };

    refreshSchema();
    checkDeviceStatus();
    fetchDetections();
    fetchSessions();

    const statusSubscription = supabase
      .channel('device_status_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'device_control' },
        handleStatusChange
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'device_control' },
        handleStatusChange
      )
      .subscribe((status) => {
        console.log('[Insert.jsx] device_control sub:', status);
      });

    const detectionsSubscription = supabase
      .channel('recyclable_detections')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'recyclables' },
        handleNewDetection
      )
      .subscribe((status) => {
        console.log('[Insert.jsx] recyclables sub:', status);
      });

    return () => {
      console.log('[Insert.jsx] Unmounting');
      supabase.removeChannel(statusSubscription);
      supabase.removeChannel(detectionsSubscription);
    };
  }, []);

  const checkDeviceStatus = async () => {
    console.log('[Insert.jsx] Checking status');
    try {
      const { data, error } = await supabase
        .from('device_control')
        .select('command, updated_at')
        .eq('device_id', 'esp32-cam-1')
        .eq('user_id', userData.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('[Insert.jsx] Status error:', error);
        if (error.message.includes('does not exist')) {
          setDbError(true);
          throw new Error('Device control table missing.');
        }
        if (error.code === '500') {
          setDbError(true);
          throw new Error('Supabase server error. Please check your database configuration.');
        }
        throw error;
      }

      console.log('[Insert.jsx] Status data:', data);
      if (data && data.length > 0) {
        const isActive = data[0].command === 'start';
        // Only set initial state if isSensing hasn't been set by startSensing
        if (!isSensing) {
          setIsSensing(isActive);
          setSystemStatus(isActive ? 'Scanning...' : 'Idle');
        }
      }
    } catch (error) {
      console.error('[Insert.jsx] Status check error:', error);
      setAlert({
        type: 'error',
        message: `Status check failed: ${error.message}`,
      });
    }
  };

  const fetchDetections = async () => {
    if (!userData.id) {
      setAlert({ type: 'error', message: 'User ID not found. Please log in.' });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('recyclables')
        .select('id, device_id, material, quantity, created_at')
        .eq('user_id', userData.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      console.log('[Insert.jsx] Detections:', data);
      setDetections(data || []);
      if (data.length > 0) {
        setAlert({
          type: 'success',
          message: `Received ${data.length} detection(s).`,
        });
      }
    } catch (error) {
      console.error('[Insert.jsx] Fetch error:', error);
      setAlert({
        type: 'error',
        message: `Fetch error: ${error.message}`,
      });
    }
  };

  const fetchSessions = async () => {
    if (!userData.id) {
      setAlert({ type: 'error', message: 'User ID not found. Please log in.' });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('recycling_sessions')
        .select('id, bottle_count, can_count, points_earned, money_val, created_at')
        .eq('user_id', userData.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      console.log('[Insert.jsx] Sessions:', data);
      setSessions(data || []);
    } catch (error) {
      console.error('[Insert.jsx] Fetch sessions error:', error);
      setAlert({
        type: 'error',
        message: `Fetch sessions error: ${error.message}`,
      });
    }
  };

  const handleStatusChange = (payload) => {
    console.log('[Insert.jsx] Status event:', payload);
    const { new: newRecord } = payload;
    if (newRecord.device_id === 'esp32-cam-1' && newRecord.user_id === userData.id) {
      const isActive = newRecord.command === 'start';
      // Only update isSensing if the change wasn't triggered by this component
      setIsSensing((prev) => {
        // If we're already sensing and this is a stop command, update the state
        // If we're not sensing and this is a start command, update the state
        if (prev && !isActive) {
          setSystemStatus('Idle');
          setAlert({ type: 'info', message: 'Sensor stopped externally' });
          return false;
        } else if (!prev && isActive) {
          setSystemStatus('Scanning...');
          setAlert({ type: 'info', message: 'Sensor started externally' });
          return true;
        }
        return prev; // Otherwise, preserve the current state
      });
    }
  };

  const handleNewDetection = (payload) => {
    console.log('[Insert.jsx] Detection event:', payload);
    const { new: newDetection } = payload;
    if (newDetection.user_id === userData.id) {
      setDetections((prev) => [newDetection, ...prev.slice(0, 4)]);
      setAlert({
        type: 'success',
        message: `Detected: ${newDetection.material} (${newDetection.quantity})`,
      });
    }
  };

  const startSensing = async () => {
    if (isSensing || isLoading || dbError || !userData.id) {
      if (!userData.id) {
        setAlert({ type: 'error', message: 'User ID not found. Please log in.' });
      }
      return;
    }
    setIsLoading(true);
    console.log('[Insert.jsx] Start command');

    try {
      await supabase.from('recycling_sessions').select('id').limit(1);

      const { data: sessionData, error: sessionError } = await supabase
        .from('recycling_sessions')
        .insert([
          {
            user_id: userData.id,
            bottle_count: 0,
            can_count: 0,
            points_earned: 0,
            money_val: 0,
            created_at: new Date().toISOString(),
          },
        ])
        .select('id')
        .single();

      if (sessionError) throw sessionError;

      console.log('[Insert.jsx] New session created:', sessionData);
      setCurrentSessionId(sessionData.id);

      const newCommand = {
        device_id: 'esp32-cam-1',
        command: 'start',
        user_id: userData.id,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('device_control')
        .upsert([newCommand], { onConflict: 'device_id,user_id' });

      if (error) throw error;

      const { data, error: fetchError } = await supabase
        .from('device_control')
        .select('command')
        .eq('device_id', 'esp32-cam-1')
        .eq('user_id', userData.id)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (fetchError || !data || data[0].command !== 'start') {
        throw new Error('Failed to verify start command');
      }

      setIsSensing(true);
      setSystemStatus('Scanning...');
      setAlert({ type: 'success', message: 'Sensor started' });
      setDetections([]);
      console.log('[Insert.jsx] After startSensing - isSensing:', true, 'isLoading:', false, 'dbError:', dbError, 'currentSessionId:', sessionData.id);
    } catch (error) {
      console.error('[Insert.jsx] Start error:', error);
      setAlert({
        type: 'error',
        message: `Start failed: ${error.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const stopSensing = async () => {
    console.log('[Insert.jsx] Attempting stopSensing - isSensing:', isSensing, 'isLoading:', isLoading, 'dbError:', dbError, 'userData.id:', userData.id, 'currentSessionId:', currentSessionId);
    if (!isSensing || isLoading || dbError || !userData.id || !currentSessionId) return;
    setIsLoading(true);
    console.log('[Insert.jsx] Stop command');

    try {
      const newCommand = {
        device_id: 'esp32-cam-1',
        command: 'stop',
        user_id: userData.id,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('device_control')
        .upsert([newCommand], { onConflict: 'device_id,user_id' });

      if (error) throw error;

      const { data, error: fetchError } = await supabase
        .from('device_control')
        .select('command')
        .eq('device_id', 'esp32-cam-1')
        .eq('user_id', userData.id)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (fetchError || !data || data[0].command !== 'stop') {
        throw new Error('Failed to verify stop command');
      }

      const { data: sessionDetections, error: detectionError } = await supabase
        .from('recyclables')
        .select('material, quantity')
        .eq('user_id', userData.id)
        .gte('created_at', (await supabase
          .from('recycling_sessions')
          .select('created_at')
          .eq('id', currentSessionId)
          .single()).data.created_at);

      if (detectionError) throw detectionError;

      let bottleCount = 0;
      let canCount = 0;
      sessionDetections.forEach((detection) => {
        if (detection.material === 'Plastic Bottle') {
          bottleCount += detection.quantity;
        } else if (detection.material === 'Can') {
          canCount += detection.quantity;
        }
      });

      const pointsPerItem = 10;
      const moneyPerItem = 0.05;
      const pointsEarned = (bottleCount + canCount) * pointsPerItem;
      const moneyVal = (bottleCount + canCount) * moneyPerItem;

      const { error: updateError } = await supabase
        .from('recycling_sessions')
        .update({
          bottle_count: bottleCount,
          can_count: canCount,
          points_earned: pointsEarned,
          money_val: moneyVal,
        })
        .eq('id', currentSessionId);

      if (updateError) throw updateError;

      const { error: userError } = await supabase
        .from('users')
        .update({ points: userData.points + pointsEarned })
        .eq('id', userData.id);

      if (userError) throw userError;

      await fetchSessions();

      setIsSensing(false);
      setSystemStatus('Idle');
      setCurrentSessionId(null);
      setAlert({
        type: 'success',
        message: `Session ended. Earned ${pointsEarned} points ($${moneyVal.toFixed(2)}).`,
      });
    } catch (error) {
      console.error('[Insert.jsx] Stop error:', error);
      setAlert({
        type: 'error',
        message: `Stop failed: ${error.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout title="Insert Recyclables">
      {alert.message && (
        <div className={`alert ${alert.type}`}>
          {alert.message}
          <button onClick={() => setAlert({ type: '', message: '' })}>×</button>
        </div>
      )}

      {dbError && (
        <div className="setup-instructions">
          <h3>Database Setup Needed</h3>
          <p>Run this SQL in Supabase SQL Editor to fix the schema:</p>
          <pre>
{`-- Add user_id to device_control
ALTER TABLE public.device_control
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS device_control_user_id_idx ON public.device_control (user_id);

-- Add id column as primary key
ALTER TABLE public.device_control
ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT gen_random_uuid();

-- Drop existing primary key constraint on device_id (if it exists)
ALTER TABLE public.device_control
DROP CONSTRAINT IF EXISTS device_control_pkey;

-- Add unique constraint on (device_id, user_id)
ALTER TABLE public.device_control
ADD CONSTRAINT device_control_device_id_user_id_unique UNIQUE (device_id, user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.device_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recyclables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recycling_sessions ENABLE ROW LEVEL SECURITY;

-- Update RLS policies
DROP POLICY IF EXISTS "Allow all operations on device_control" ON public.device_control;
CREATE POLICY "Allow users to manage their device control"
  ON public.device_control FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow all operations on recyclables" ON public.recyclables;
CREATE POLICY "Allow users to manage their recyclables"
  ON public.recyclables FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow all operations on recycling_sessions" ON public.recycling_sessions;
CREATE POLICY "Allow users to manage their recycling sessions"
  ON public.recycling_sessions FOR ALL
  USING (auth.uid() = user_id);
`}
          </pre>
          <button
            className="control-btn start-btn"
            onClick={() => window.location.reload()}
          >
            Reload After Setup
          </button>
        </div>
      )}

      {!dbError && (
        <div className="insert-grid">
          <div className="status-card">
            <div className="stat-label">
              <FontAwesomeIcon icon={faRecycle} /> Sensor Status
            </div>
            <div className="stat-value" style={{ color: isSensing ? '#4caf50' : '#666' }}>
              {systemStatus}
            </div>
          </div>

          <div className="control-card">
            <div className="button-group">
              <button
                type="button"
                className="control-btn start-btn"
                onClick={startSensing}
                disabled={isSensing || isLoading || dbError}
              >
                <FontAwesomeIcon icon={faPlay} /> {isLoading ? 'Starting...' : 'Start Sensing'}
              </button>

              <button
                type="button"
                className="control-btn stop-btn"
                onClick={stopSensing}
                disabled={!isSensing || isLoading || dbError}
              >
                <FontAwesomeIcon icon={faStop} /> {isLoading ? 'Stopping...' : 'Stop Sensing'}
              </button>
            </div>
          </div>

          <div className="detections-card">
            <div className="stat-label">
              <FontAwesomeIcon icon={faHistory} /> Current Session Detections
            </div>
            {detections.length > 0 ? (
              <ul className="detections-list">
                {detections.map((item) => (
                  <li key={item.id}>
                    {item.material} ({item.quantity}) -{' '}
                    {new Date(item.created_at).toLocaleString()}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                No detections.{' '}
                {isSensing
                  ? 'ESP32-CAM is sensing. Check Serial Monitor for Supabase errors.'
                  : 'Click "Start Sensing".'}
              </p>
            )}
          </div>

          <div className="sessions-card">
            <div className="stat-label">
              <FontAwesomeIcon icon={faList} /> Past Sessions
            </div>
            {sessions.length > 0 ? (
              <ul className="sessions-list">
                {sessions.map((session) => (
                  <li key={session.id}>
                    Bottles: {session.bottle_count}, Cans: {session.can_count}, Points: {session.points_earned}, Value: ${session.money_val.toFixed(2)} -{' '}
                    {new Date(session.created_at).toLocaleString()}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No past sessions.</p>
            )}
          </div>

          <div className="preview-card">
            <div className="stat-label">User: {userData.name}</div>
            <div className="stat-value">Points: {userData.points}</div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Insert;