import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop } from '@fortawesome/free-solid-svg-icons';
import '../styles/Insert.css';

const API_URL = process.env.REACT_APP_API_URL || 'https://ecopoints-api.vercel.app';

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

  const startSensing = async () => {
    if (isSensing) return;
    try {
      const response = await fetch(`${API_URL}/api/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'start', device_id: 'esp32-cam-1' })
      });
      if (!response.ok) {
        throw new Error('Failed to start device');
      }
      setIsSensing(true);
      setSystemStatus('Scanning...');
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
    } catch (error) {
      console.error('Start sensing error:', error.message);
      setAlert({ type: 'error', message: `Failed to start sensing: ${error.message}` });
    }
  };

  const stopSensing = async () => {
    try {
      await fetch(`${API_URL}/api/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'stop', device_id: 'esp32-cam-1' })
      });
    } catch (error) {
      console.error('Stop sensing error:', error.message);
    }
    setIsSensing(false);
    setSystemStatus('Idle');
    setTimer('');
  };

  const updateEarnings = () => {
    const points = bottleCount * 2 + canCount * 3;
    const money = (bottleCount * 0.5 + canCount * 0.75).toFixed(2);
    setPointsEarned(points);
    setMoneyEarned(money);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const userId = localStorage.getItem('user_id');
    const token = localStorage.getItem('token');
    if (!userId || !token) {
      setAlert({ type: 'error', message: 'Please log in to save recyclables' });
      return;
    }
    const payload = { 
      user_id: userId,
      bottle_quantity: bottleCount, 
      can_quantity: canCount,
      points_earned: pointsEarned,
      money_earned: parseFloat(moneyEarned)
    };
    try {
      const response = await fetch(`${API_URL}/api/insert-recyclables`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setAlert({ type: 'success', message: 'Recyclables added successfully!' });
        resetSensorData();
        await fetchUserData();
      } else {
        throw new Error(result.message || 'Failed to add recyclables');
      }
    } catch (error) {
      console.error('Submit error:', error.message);
      setAlert({ type: 'error', message: `Error: ${error.message}` });
    }
    await stopSensing();
  };

  const resetSensorData = () => {
    setBottleCount(0);
    setCanCount(0);
    setQuantity(0);
    setMaterial('Unknown');
    setPointsEarned(0);
    setMoneyEarned(0);
  };

  const fetchUserData = async (retries = 3, delay = 2000) => {
    const userId = localStorage.getItem('user_id');
    const token = localStorage.getItem('token');
    if (!userId || !token) {
      console.warn('No user ID or token, redirecting to login');
      window.location.href = '/login';
      return;
    }
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Attempt ${attempt}: Fetching user data for ID: ${userId}`);
        const response = await fetch(`${API_URL}/api/user-stats/${userId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (!data.name || typeof data.points === 'undefined') {
          throw new Error('Invalid user data format');
        }
        console.log('User data fetched:', data);
        setUserData(data);
        return;
      } catch (error) {
        console.error(`Fetch attempt ${attempt} failed:`, error.message);
        if (attempt < retries) {
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error('Final fetch error:', error.message);
          setAlert({
            type: 'error',
            message: `Failed to load user data: ${error.message}`
          });
          setUserData({ name: 'Guest', points: 0 });
          window.location.href = '/login';
        }
      }
    }
  };

  useEffect(() => {
    fetchUserData();
    // Poll for recyclables
    const pollRecyclables = async () => {
      try {
        const response = await fetch(`${API_URL}/api/recyclables?device_id=esp32-cam-1`, {
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (data && data.length) {
          data.forEach(item => {
            setMaterial(item.material);
            setQuantity(prev => prev + item.quantity);
            if (item.material === 'bottle') {
              setBottleCount(prev => prev + item.quantity);
            } else if (item.material === 'can') {
              setCanCount(prev => prev + item.quantity);
            }
          });
          updateEarnings();
        }
      } catch (error) {
        console.error('Poll recyclables error:', error.message);
      }
    };
    const interval = setInterval(pollRecyclables, 5000);
    return () => {
      clearInterval(interval);
      stopSensing();
    };
  }, []);

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
          <div className="stat-label"><FontAwesomeIcon icon={faRecycle} /> Sensor Status</div>
          <div className="stat-value" style={{ color: isSensing ? '#4caf50' : '#666' }}>{systemStatus}</div>
          <div className="stat-label">Material: {material}</div>
          <div className="stat-value">{quantity}</div>
          <div className="stat-label">Items Detected</div>
          <div className="detection-counts">
            <div>Bottles: {bottleCount}</div>
            <div>Cans: {canCount}</div>
          </div>
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
            <button 
              type="submit" 
              className="control-btn submit-btn" 
              disabled={!bottleCount && !canCount}
            >
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