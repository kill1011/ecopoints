import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop } from '@fortawesome/free-solid-svg-icons';
import Pusher from 'pusher-js';
import '../styles/Insert.css';

const PUSHER_KEY = '528b7d374844d8b54864';
const PUSHER_CLUSTER = 'ap1';
const API_URL = process.env.REACT_APP_API_URL || 'https://ecopoints-api.vercel.app';

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

  useEffect(() => {
    const pusher = new Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER, forceTLS: true });
    const channel = pusher.subscribe('ecopoints');
    channel.bind('pusher:subscription_succeeded', () => {
      setAlert({ type: 'info', message: 'Connected to sensor' });
    });
    return () => {
      channel.unbind_all();
      pusher.disconnect();
    };
  }, []);

  const startSensing = async () => {
    if (isSensing || isLoading) return;
    setIsLoading(true);
    try {
      console.log(`Fetching POST ${API_URL}/api/control with body:`, {
        command: 'start',
        device_id: 'esp32-cam-1',
      });
      const response = await fetch(`${API_URL}/api/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'start', device_id: 'esp32-cam-1' }),
        mode: 'cors',
        signal: AbortSignal.timeout(5000),
      });

      console.log('Start sensing response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No response body');
        throw new Error(`HTTP error: ${response.status} ${response.statusText}, Body: ${errorText}`);
      }

      const result = await response.json();
      console.log('Start sensing data:', result);
      setIsSensing(true);
      setSystemStatus('Scanning...');
      setAlert({ type: 'success', message: 'Sensor started' });
    } catch (error) {
      console.error('Start sensing error:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
      setAlert({ type: 'error', message: `Failed to start: ${error.message}` });
      setSystemStatus('Idle');
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
              disabled={isSensing || isLoading}
            >
              <FontAwesomeIcon icon={faPlay} /> {isLoading ? 'Starting...' : 'Start Sensing'}
            </button>
          </div>
        </div>
        <div className="preview-card">
          <div className="stat-label">User: {userData.name}</div>
        </div>
      </div>
    </Layout>
  );
};

export default Insert;