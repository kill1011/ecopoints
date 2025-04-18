import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop, faHistory } from '@fortawesome/free-solid-icons';
import { createClient } from '@supabase/supabase-js';
import '../styles/Insert.css';

const supabaseUrl = "https://welxjeybnoeeusehuoat.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlbHhqZXlibm9lZXVzZWh1b2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQxMTgzNzIsImV4cCI6MjA1OTY5NDM3Mn0.TmkmlnAA1ZmGgwgiFLsKW_zB7APzjFvuo3H9_Om_GCs";
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
  },
});

const Insert = () => {
  const [userData, setUserData] = useState({
    name: 'Guest',
    points: 0,
    id: null,
  });
  const [alert, setAlert] = useState({ type: '', message: '' });
  const [systemStatus, setSystemStatus] = useState('Idle');
  const [isSensing, setIsSensing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [detections, setDetections] = useState([]);
  const [dbError, setDbError] = useState(false);
  const [deviceConnected, setDeviceConnected] = useState(false);

  useEffect(() => {
    console.log('Initializing Insert.jsx: Checking session and subscriptions');
    // Check Supabase session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && session.user) {
        setUserData({
          name: session.user.email || 'User',
          points: 0, // Adjust if you have a points system
          id: session.user.id,
        });
      } else {
        setAlert({ type: 'error', message: 'Please log in to use the sensor' });
        setUserData({ name: 'Guest', points: 0, id: null });
      }
    };
    checkSession();
    checkDeviceStatus();

    if (!userData.id) return;

    // Subscribe to device_controls changes
    const statusSubscription = supabase
      .channel('device_status_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'device_controls', filter: `device_id=eq.esp32-cam-1&user_id=eq.${userData.id}` },
        (payload) => {
          console.log('Device control change:', payload);
          handleStatusChange(payload);
        }
      )
      .subscribe((status) => {
        console.log('Device control subscription status:', status);
      });

    // Subscribe to recyclables changes
    const detectionsSubscription = supabase
      .channel('recyclable_detections')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'recyclables', filter: `device_id=eq.esp32-cam-1&user_id=eq.${userData.id}` },
        (payload) => {
          console.log('New recyclable detection:', payload);
          handleNewDetection(payload);
        }
      )
      .subscribe((status) => {
        console.log('Recyclables subscription status:', status);
      });

    const interval = setInterval(checkDeviceActivity, 30000);

    return () => {
      console.log('Cleaning up subscriptions');
      supabase.removeChannel(statusSubscription);
      supabase.removeChannel(detectionsSubscription);
      clearInterval(interval);
    };
  }, [userData.id]);

  const checkDeviceStatus = async () => {
    if (!userData.id) return;

    try {
      console.log('Checking device status');
      const { data, error } = await supabase
        .from('device_controls')
        .select('*')
        .eq('device_id', 'esp32-cam-1')
        .eq('user_id', userData.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Device status error:', error);
        if (error.code === 'PGRST301' || error.message.includes('does not exist')) {
          setDbError(true);
          throw new Error("Database tables not initialized. Please set up the database.");
        }
        throw error;
      }

      console.log('Device status data:', data);
      if (data && data.length > 0) {
        const isActive = data[0].command === 'start';
        setIsSensing(isActive);
        setSystemStatus(isActive ? 'Scanning...' : 'Idle');
        setDeviceConnected(true);
      } else {
        setSystemStatus('Idle');
        setIsSensing(false);
      }

      await fetchRecentDetections();
    } catch (error) {
      console.error('Error checking device status:', error);
      setAlert({
        type: 'error',
        message: error.message,
      });
    }
  };

  const checkDeviceActivity = async () => {
    if (!userData.id) return;

    try {
      console.log('Checking device activity');
      const { data, error } = await supabase
        .from('recyclables')
        .select('created_at')
        .eq('device_id', 'esp32-cam-1')
        .eq('user_id', userData.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      console.log('Device activity data:', data);
      if (data && data.length > 0) {
        const lastActivity = new Date(data[0].created_at);
        const now = new Date();
        const diffMinutes = (now - lastActivity) / (1000 * 60);
        setDeviceConnected(diffMinutes < 5);
      } else {
        setDeviceConnected(false);
      }
    } catch (error) {
      console.error('Error checking device activity:', error);
      setDeviceConnected(false);
    }
  };

  const fetchRecentDetections = async () => {
    if (dbError || !userData.id) return;

    try {
      console.log('Fetching recent detections');
      const { data, error } = await supabase
        .from('recyclables')
        .select('*')
        .eq('device_id', 'esp32-cam-1')
        .eq('user_id', userData.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      console.log('Fetched detections:', data);
      setDetections(data || []);
    } catch (error) {
      console.error('Error fetching detections:', error);
      setAlert({
        type: 'error',
        message: 'Failed to fetch recent detections',
      });
    }
  };

  const handleStatusChange = (payload) => {
    console.log('Handling status change:', payload);
    const { new: newRecord } = payload;
    if (newRecord.device_id === 'esp32-cam-1' && newRecord.user_id === userData.id) {
      const isActive = newRecord.command === 'start';
      setIsSensing(isActive);
      setSystemStatus(isActive ? 'Scanning...' : 'Idle');
      setAlert({
        type: 'info',
        message: `Device status changed to: ${isActive ? 'Active' : 'Idle'}`,
      });
    }
  };

  const handleNewDetection = (payload) => {
    console.log('Handling new detection:', payload);
    const { new: newDetection } = payload;
    if (newRecord.device_id === 'esp32-cam-1' && newRecord.user_id === userData.id) {
      setDetections((prev) => {
        const updated = [newDetection, ...prev.slice(0, 4)];
        console.log('Updated detections:', updated);
        return updated;
      });
      setAlert({
        type: 'success',
        message: `New detection: ${newDetection.material} (${newDetection.quantity}, Confidence: ${newDetection.confidence.toFixed(2)})`,
      });
      setDeviceConnected(true);
      fetchRecentDetections();
    }
  };

  const startSensing = async () => {
    if (isSensing || isLoading || dbError || !deviceConnected || !userData.id) {
      setAlert({
        type: 'error',
        message: isSensing
          ? 'Sensor already running'
          : !deviceConnected
          ? 'Device not connected'
          : !userData.id
          ? 'Please log in'
          : 'Database not initialized',
      });
      return;
    }
    setIsLoading(true);

    try {
      console.log('Starting sensing');
      const newCommand = {
        device_id: 'esp32-cam-1',
        command: 'start',
        created_at: new Date().toISOString(),
        user_id: userData.id,
      };

      const { error } = await supabase.from('device_controls').insert([newCommand]);

      if (error) throw error;

      setIsSensing(true);
      setSystemStatus('Scanning...');
      setAlert({ type: 'success', message: 'Sensor started' });
    } catch (error) {
      console.error('Start sensing error:', error);
      setAlert({
        type: 'error',
        message: `Failed to start: ${error.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const stopSensing = async () => {
    if (!isSensing || isLoading || dbError) {
      setAlert({
        type: 'error',
        message: !isSensing ? 'Sensor not running' : 'Database not initialized',
      });
      return;
    }
    setIsLoading(true);

    try {
      console.log('Stopping sensing');
      const newCommand = {
        device_id: 'esp32-cam-1',
        command: 'stop',
        created_at: new Date().toISOString(),
        user_id: userData.id,
      };

      const { error } = await supabase.from('device_controls').insert([newCommand]);

      if (error) throw error;

      setIsSensing(false);
      setSystemStatus('Idle');
      setAlert({ type: 'success', message: 'Sensor stopped' });
      await fetchRecentDetections();
    } catch (error) {
      console.error('Stop sensing error:', error);
      setAlert({
        type: 'error',
        message: `Failed to stop: ${error.message}`,
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
          <h3>Database Setup Required</h3>
          <p>Please run the following SQL in Supabase SQL Editor:</p>
          <pre>
            {`-- Enable uuid-ossp extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create device_controls table
CREATE TABLE IF NOT EXISTS public.device_controls (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    device_id TEXT NOT NULL,
    command TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create recyclables table
CREATE TABLE IF NOT EXISTS public.recyclables (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    device_id TEXT NOT NULL,
    material TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    confidence REAL DEFAULT 0.0,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Add indices
CREATE INDEX IF NOT EXISTS device_controls_device_id_idx ON public.device_controls (device_id);
CREATE INDEX IF NOT EXISTS device_controls_user_id_idx ON public.device_controls (user_id);
CREATE INDEX IF NOT EXISTS recyclables_device_id_idx ON public.recyclables (device_id);
CREATE INDEX IF NOT EXISTS recyclables_user_id_idx ON public.recyclables (user_id);

-- Enable RLS
ALTER TABLE public.device_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recyclables ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users manage device_controls" 
  ON public.device_controls FOR ALL TO authenticated 
  USING (user_id = auth.uid() OR user_id IS NULL) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users access own recyclables" 
  ON public.recyclables FOR ALL TO authenticated 
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Allow anon read device_controls" 
  ON public.device_controls FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert to recyclables" 
  ON public.recyclables FOR INSERT TO anon WITH CHECK (true);`}
          </pre>
          <button
            className="control-btn start-btn"
            onClick={() => window.location.reload()}
          >
            Reload After Setup
          </button>
        </div>
      )}

      <div className="insert-grid">
        <div className="status-card">
          <div className="stat-label">
            <FontAwesomeIcon icon={faRecycle} /> Sensor Status
          </div>
          <div className="stat-value" style={{ color: isSensing ? '#4caf50' : '#666' }}>
            {systemStatus}
          </div>
          <div className="stat-label">
            Device Connection
          </div>
          <div className="stat-value" style={{ color: deviceConnected ? '#4caf50' : '#f44336' }}>
            {deviceConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>

        <div className="control-card">
          <div className="button-group">
            <button
              type="button"
              className="control-btn start-btn"
              onClick={startSensing}
              disabled={isSensing || isLoading || dbError || !deviceConnected || !userData.id}
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
            <FontAwesomeIcon icon={faHistory} /> Recent Detections
          </div>
          {detections.length > 0 ? (
            <ul className="detections-list">
              {detections.map((item) => (
                <li key={item.id}>
                  {item.material} ({item.quantity}, Confidence: {item.confidence.toFixed(2)}) -{' '}
                  {new Date(item.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          ) : (
            <p>No recent detections</p>
          )}
        </div>

        <div className="preview-card">
          <div className="stat-label">User: {userData.name}</div>
        </div>
      </div>
    </Layout>
  );
};

export default Insert;