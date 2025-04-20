import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop } from '@fortawesome/free-solid-svg-icons';
import '../styles/Insert.css';

// Supabase configuration (same as ESP32)
const supabaseUrl = "https://welxjeybnoeeusehuoat.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlbHhqZXlibm9lZXVzZWh1b2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQxMTgzNzIsImV4cCI6MjA1OTY5NDM3Mn0.TmkmlnAA1ZmGgwgiFLsKW_zB7APzjFvuo3H9_Om_GCs";
const supabase = createClient(supabaseUrl, supabaseKey);

const Insert = () => {
  const wsRef = useRef(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  const [userData, setUserData] = useState({ 
    name: user.name || 'Guest', 
    points: 0
  });

  const [alert, setAlert] = useState({ type: '', message: '' });
  const [systemStatus, setSystemStatus] = useState('-');
  const [material, setMaterial] = useState('Unknown');
  const [quantity, setQuantity] = useState(0);
  const [bottleCount, setBottleCount] = useState(0);
  const [canCount, setCanCount] = useState(0);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [moneyEarned, setMoneyEarned] = useState(0);
  const [isSensing, setIsSensing] = useState(false);
  const [timer, setTimer] = useState('');
  const [lastChecked, setLastChecked] = useState(null);

  const deviceId = "esp32-cam-1";
  const userId = localStorage.getItem('user_id');

  const startSensing = async () => {
    if (isSensing) return;
    setIsSensing(true);
    setSystemStatus('Scanning...');

    try {
      const { error } = await supabase
        .from('device_controls')
        .insert({
          device_id: deviceId,
          command: 'start',
          user_id: userId || null,
          created_at: new Date().toISOString(),
        });

      if (error) {
        console.error('Error sending start command:', error);
        setAlert({ type: 'error', message: 'Failed to start sensing.' });
        setIsSensing(false);
        setSystemStatus('Idle');
        return;
      }
    } catch (error) {
      console.error('Error sending start command:', error);
      setAlert({ type: 'error', message: 'Failed to start sensing.' });
      setIsSensing(false);
      setSystemStatus('Idle');
      return;
    }

    let timeLeft = 30;
    const interval = setInterval(() => {
      if (!isSensing) {
        clearInterval(interval);
        return;
      }
      setTimer(`Time Left: ${timeLeft}s`);
      timeLeft--;
      if (timeLeft < 0) stopSensing();
    }, 1000);
  };

  const stopSensing = async () => {
    setIsSensing(false);
    setSystemStatus('Idle');
    setTimer('');

    try {
      const { error } = await supabase
        .from('device_controls')
        .insert({
          device_id: deviceId,
          command: 'stop',
          user_id: userId || null,
          created_at: new Date().toISOString(),
        });

      if (error) {
        console.error('Error sending stop command:', error);
        setAlert({ type: 'error', message: 'Failed to stop sensing.' });
      }
    } catch (error) {
      console.error('Error sending stop command:', error);
      setAlert({ type: 'error', message: 'Failed to stop sensing.' });
    }
  };

  const updateEarnings = () => {
    const points = bottleCount * 2 + canCount * 3;
    const money = (bottleCount * 0.5 + canCount * 0.75).toFixed(2);
    setPointsEarned(points);
    setMoneyEarned(money);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { bottle_quantity: bottleCount, can_quantity: canCount };
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/insert-recyclables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get('Content-Type');
      if (!contentType || !contentType.toLowerCase().includes('application/json')) {
        throw new Error('Server did not return JSON for insert-recyclables');
      }

      const result = await response.json();
      if (result.success) {
        setAlert({ type: 'success', message: 'Recyclables added successfully!' });
        resetSensorData();
        const userId = localStorage.getItem('user_id');
        const userResponse = await fetch(`${apiUrl}/api/user/${userId}`);
        setUserData(await userResponse.json());
      } else {
        setAlert({ type: 'error', message: result.message || 'Failed to add recyclables.' });
      }
    } catch (error) {
      setAlert({ type: 'error', message: 'An error occurred.' });
      console.error(error);
    }
    stopSensing();
  };

  const resetSensorData = () => {
    setBottleCount(0);
    setCanCount(0);
    setQuantity(0);
    setMaterial('Unknown');
    setPointsEarned(0);
    setMoneyEarned(0);
    setLastChecked(null);
  };

  const pollRecyclables = async () => {
    if (!userId) {
      console.error('No user_id found in localStorage');
      setAlert({ type: 'error', message: 'Please log in to view recyclables data.' });
      return;
    }

    try {
      let query = supabase
        .from('recyclables')
        .select('material, quantity, created_at')
        .eq('device_id', deviceId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (lastChecked) {
        query = query.gt('created_at', lastChecked);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error polling recyclables:', error);
        setAlert({ type: 'error', message: 'Failed to fetch recyclables data.' });
        return;
      }

      if (data && data.length > 0) {
        const latestTimestamp = data[0].created_at;
        setLastChecked(latestTimestamp);

        let newBottleCount = bottleCount;
        let newCanCount = canCount;
        let totalQuantity = quantity;

        data.forEach((item) => {
          const material = item.material;
          const qty = item.quantity || 1;
          totalQuantity += qty;

          if (material === 'Plastic Bottle') {
            newBottleCount += qty;
          } else if (material === 'Can') {
            newCanCount += qty;
          }

          setMaterial(material);
          setQuantity(totalQuantity);
          setBottleCount(newBottleCount);
          setCanCount(newCanCount);
        });

        updateEarnings();
      }
    } catch (error) {
      console.error('Error polling recyclables:', error);
      setAlert({ type: 'error', message: 'Failed to fetch recyclables data.' });
    }
  };

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('user_id');

    // Log token for debugging
    console.log('Token from localStorage:', token);
    console.log('User ID from localStorage:', userId);

    if (!userId || !token) {
      console.warn('Missing userId or token, redirecting to login');
      window.location.href = '/login';
      return;
    }

    const fetchUserData = async () => {
      try {
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}/api/user-stats/${userId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        // Check for authentication errors first
        if (response.status === 401 || response.status === 403) {
          console.warn('Unauthorized or Forbidden response, redirecting to login');
          localStorage.removeItem('token');
          localStorage.removeItem('user_id');
          localStorage.removeItem('user');
          window.location.href = '/login';
          return;
        }

        // Log the response for debugging
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);

        const contentType = response.headers.get('Content-Type');
        if (!contentType || !contentType.toLowerCase().includes('application/json')) {
          console.error('Unexpected Content-Type:', contentType);
          throw new Error('Server did not return JSON. Check if the endpoint exists and the server is running.');
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch user data: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('User data fetched:', data);
        setUserData(data);
      } catch (error) {
        console.error('Error fetching user data:', error);
        setAlert({
          type: 'error',
          message: 'Failed to load user data. Please try logging in again.',
        });
      }
    };

    fetchUserData();

    const pollInterval = setInterval(() => {
      if (isSensing) {
        pollRecyclables();
      }
    }, 2000);

    return () => {
      clearInterval(pollInterval);
      if (wsRef.current) wsRef.current.close();
    };
  }, [isSensing]);

  return (
    <Layout title="Insert Recyclables">
      <div className="insert-grid">
        <div className="status-card">
          <div className="stat-label"><FontAwesomeIcon icon={faRecycle} /> Sensor Status</div>
          <div className="stat-value" style={{ color: isSensing ? '#4caf50' : '#666' }}>{systemStatus}</div>
          <div className="stat-label">Material: {material}</div>
          <div className="stat-value">{quantity}</div>
          <div className="stat-label">Items Detected</div>
        </div>

        <div className="control-card">
          <form onSubmit={handleSubmit}>
            <div className="button-group">
              <button
                type="button"
                className="control-btn start-btn"
                onClick={startSensing}
                disabled={isSensing}
              >
                <FontAwesomeIcon icon={faPlay} /> Start Sensing
              </button>
              <button
                type="button"
                className="control-btn cancel-btn"
                onClick={stopSensing}
                style={{ display: isSensing ? 'block' : 'none' }}
              >
                <FontAwesomeIcon icon={faStop} /> Cancel
              </button>
            </div>
            <button type="submit" className="control-btn submit-btn" disabled={!isSensing}>
              Add Recyclables
            </button>
            <div className="timer-display">{timer}</div>
          </form>
        </div>

        <div className="preview-card">
          <div className="stat-label">Earnings Preview</div>
          <div className="stat-value">{pointsEarned}</div>
          <div className="stat-label">Points</div>
          <div className="stat-value">₱{moneyEarned}</div>
          <div className="stat-label">Money</div>
        </div>
      </div>
    </Layout>
  );
};

export default Insert;