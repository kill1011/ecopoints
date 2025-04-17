import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop, faHistory } from '@fortawesome/free-solid-icons';
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
    checkDeviceStatus();

    const subscription = supabase
      .channel('device_status_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'device_controls' },
        handleStatusChange
      )
      .subscribe();

    const detectionsSubscription = supabase
      .channel('recyclable_detections')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'recyclables' },
        handleNewDetection
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
      supabase.removeChannel(detectionsSubscription);
    };
  }, []);

  const checkDeviceStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('device_controls')
        .select('*')
        .eq('device_id', 'esp32-cam-1')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        if (error.message.includes('does not exist')) {
          setDbError(true);
          throw new Error("Database tables don't exist.");
        }
        throw error;
      }

      if (data && data.length > 0) {
        const isActive = data[0].command === 'start';
        setIsSensing(isActive);
        setSystemStatus(isActive ? 'Scanning...' : 'Idle');
      }

      fetchRecentDetections();
    } catch (error) {
      console.error('Error checking device status:', error);
      setAlert({
        type: 'error',
        message: error.message,
      });
    }
  };

  const fetchRecentDetections = async () => {
    if (dbError) return;

    try {
      const { data, error } = await supabase
        .from('recyclables')
        .select('*')
        .eq('device_id', 'esp32-cam-1')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      if (data) {
        setDetections(data);
      }
    } catch (error) {
      console.error('Error fetching detections:', error);
    }
  };

  const handleStatusChange = (payload) => {
    const { new: newRecord } = payload;
    if (newRecord.device_id === 'esp32-cam-1') {
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
    const { new: newDetection } = payload;
    if (newDetection.device_id === 'esp32-cam-1') {
      setDetections((prev) => [newDetection, ...prev.slice(0, 4)]);
      setAlert({
        type: 'success',
        message: `New detection: ${newDetection.material} (${newDetection.quantity}, Confidence: ${newDetection.confidence.toFixed(2)})`,
      });
    }
  };

  const startSensing = async () => {
    if (isSensing || isLoading || dbError) return;
    setIsLoading(true);

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
    if (!isSensing || isLoading || dbError) return;
    setIsLoading(true);

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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create recyclables table
CREATE TABLE IF NOT EXISTS public.recyclables (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    device_id TEXT NOT NULL,
    material TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    confidence REAL DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Add indices
CREATE INDEX IF NOT EXISTS device_controls_device_id_idx ON public.device_controls (device_id);
CREATE INDEX IF NOT EXISTS recyclables_device_id_idx ON public.recyclables (device_id);

-- Enable RLS
ALTER TABLE public.device_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recyclables ENABLE ROW LEVEL SECURITY;

-- Create policies
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