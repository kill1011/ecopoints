import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop, faHistory } from '@fortawesome/free-solid-svg-icons';
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
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    console.log('[Insert.jsx] Mounting');
    checkDeviceStatus();

    const statusSubscription = supabase
      .channel('device_status_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'device_controls' },
        handleStatusChange
      )
      .subscribe((status) => {
        console.log('[Insert.jsx] device_controls sub:', status);
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

    let pollInterval = null;
    if (isSensing) {
      console.log('[Insert.jsx] Polling started');
      pollInterval = setInterval(fetchRecentDetections, 5000);
    }

    return () => {
      console.log('[Insert.jsx] Unmounting');
      supabase.removeChannel(statusSubscription);
      supabase.removeChannel(detectionsSubscription);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isSensing]);

  const checkDeviceStatus = async () => {
    console.log('[Insert.jsx] Checking status');
    try {
      const { data, error } = await supabase
        .from('device_controls')
        .select('command, created_at')
        .eq('device_id', 'esp32-cam-1')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('[Insert.jsx] Status error:', error);
        if (error.message.includes('does not exist')) {
          setDbError(true);
          throw new Error("Device controls table missing.");
        }
        throw error;
      }

      console.log('[Insert.jsx] Status data:', data);
      if (data && data.length > 0) {
        const isActive = data[0].command === 'start';
        setIsSensing(isActive);
        setSystemStatus(isActive ? 'Scanning...' : 'Idle');
      }

      fetchRecentDetections();
    } catch (error) {
      console.error('[Insert.jsx] Status check error:', error);
      setAlert({
        type: 'error',
        message: `Status check failed: ${error.message}`,
      });
    }
  };

  const fetchRecentDetections = async () => {
    if (dbError) return;

    console.log('[Insert.jsx] Fetching detections');
    try {
      const { data, error } = await supabase
        .from('recyclables')
        .select('id, device_id, material, quantity, created_at')
        .eq('device_id', 'esp32-cam-1')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('[Insert.jsx] Fetch error:', error);
        throw error;
      }

      console.log('[Insert.jsx] Detections:', data);
      setDetections(data || []);
      if (data.length === 0 && isSensing) {
        setAlert({
          type: 'warning',
          message: 'No detections received. Check ESP32-CAM Serial Monitor for Supabase errors.',
        });
      } else if (data.length > 0) {
        setAlert({
          type: 'success',
          message: `Received ${data.length} detection(s).`,
        });
      }
    } catch (error) {
      console.error('[Insert.jsx] Fetch failed:', error);
      setAlert({
        type: 'error',
        message: `Fetch error: ${error.message}`,
      });
    }
  };

  const handleStatusChange = (payload) => {
    console.log('[Insert.jsx] Status event:', payload);
    const { new: newRecord } = payload;
    if (newRecord.device_id === 'esp32-cam-1') {
      const isActive = newRecord.command === 'start';
      setIsSensing(isActive);
      setSystemStatus(isActive ? 'Scanning...' : 'Idle');
      setAlert({
        type: 'info',
        message: `Sensor ${isActive ? 'started' : 'stopped'}`,
      });
    }
  };

  const handleNewDetection = (payload) => {
    console.log('[Insert.jsx] Detection event:', payload);
    const { new: newDetection } = payload;
    if (newDetection.device_id === 'esp32-cam-1') {
      setDetections((prev) => [newDetection, ...prev.slice(0, 4)]);
      setAlert({
        type: 'success',
        message: `Detected: ${newDetection.material} (${newDetection.quantity})`,
      });
    }
  };

  const startSensing = async () => {
    if (isSensing || isLoading || dbError) return;
    setIsLoading(true);
    console.log('[Insert.jsx] Start command');

    try {
      const newCommand = {
        device_id: 'esp32-cam-1',
        command: 'start',
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('device_controls').insert([newCommand]);

      if (error) throw error;

      setIsSensing(true);
      setSystemStatus('Scanning...');
      setAlert({ type: 'success', message: 'Sensor started' });
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
    if (!isSensing || isLoading || dbError) return;
    setIsLoading(true);
    console.log('[Insert.jsx] Stop command');

    try {
      const newCommand = {
        device_id: 'esp32-cam-1',
        command: 'stop',
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('device_controls').insert([newCommand]);

      if (error) throw error;

      setIsSensing(false);
      setSystemStatus('Idle');
      setAlert({ type: 'success', message: 'Sensor stopped' });
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
          <p>Run this SQL in Supabase SQL Editor:</p>
          <pre>
{`-- Enable uuid-ossp
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create device_controls
CREATE TABLE IF NOT EXISTS public.device_controls (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    device_id TEXT NOT NULL,
    command TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create recyclables
CREATE TABLE IF NOT EXISTS public.recyclables (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    device_id TEXT NOT NULL,
    material TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Indices
CREATE INDEX IF NOT EXISTS device_controls_device_id_idx ON public.device_controls (device_id);
CREATE INDEX IF NOT EXISTS recyclables_device_id_idx ON public.recyclables (device_id);

-- Enable RLS
ALTER TABLE public.device_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recyclables ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow all operations on device_controls" 
  ON public.device_controls FOR ALL USING (true);
CREATE POLICY "Allow all operations on recyclables" 
  ON public.recyclables FOR ALL USING (true);`}
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
              <FontAwesomeIcon icon={faHistory} /> Recent Detections
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

          <div className="preview-card">
            <div className="stat-label">User: {userData.name}</div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Insert;