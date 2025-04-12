import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop } from '@fortawesome/free-solid-svg-icons';
import Pusher from 'pusher-js';
import '../styles/Insert.css';

const PUSHER_KEY = '528b7d374844d8b54864';
const PUSHER_CLUSTER = 'ap1';
const API_URL = process.env.REACT_APP_API_URL || 'https://ecopoints-teal.vercel.app';

const Insert = () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [userData, setUserData] = useState({
    name: user.name || 'Guest',
    points: user.points || 0,
    id: user.id || null,
  });
  const [alert, setAlert] = useState({ type: '', message: '' });
  const [systemStatus, setSystemStatus] = useState('Idle');
  const [material, setMaterial] = useState('Unknown');
  const [quantity, setQuantity] = useState(0);
  const [bottleCount, setBottleCount] = useState(0);
  const [canCount, setCanCount] = useState(0);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [moneyEarned, setMoneyEarned] = useState(0);
  const [isSensing, setIsSensing] = useState(false);
  const [timer, setTimer] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const pusher = new Pusher(PUSHER_KEY, {
      cluster: PUSHER_CLUSTER,
      forceTLS: true,
    });

    const channel = pusher.subscribe('ecopoints');

    channel.bind('detection', (data) => {
      console.log('Pusher detection:', data);
      const { material: detectedMaterial, quantity: detectedQuantity, device_id } = data;
      if (device_id === 'esp32-cam-1') {
        setMaterial(detectedMaterial);
        setQuantity((prev) => prev + detectedQuantity);
        if (detectedMaterial === 'bottle') {
          setBottleCount((prev) => prev + detectedQuantity);
        } else if (detectedMaterial === 'can') {
          setCanCount((prev) => prev + detectedQuantity);
        }
        updateEarnings();
      }
    });

    channel.bind('pusher:subscription_succeeded', () => {
      setAlert({ type: 'info', message: 'Connected to sensor' });
    });

    channel.bind('pusher:subscription_error', (error) => {
      console.error('Pusher subscription error:', error);
      setAlert({ type: 'error', message: 'Sensor connection failed' });
    });

    return () => {
      channel.unbind_all();
      pusher.disconnect();
      stopSensing();
    };
  }, []);

  const updateEarnings = () => {
    const points = bottleCount * 2 + canCount * 3;
    const money = (bottleCount * 0.5 + canCount * 0.75).toFixed(2);
    setPointsEarned(points);
    setMoneyEarned(money);
  };

  const startSensing = async () => {
    if (isSensing || isLoading) return;
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ command: 'start', device_id: 'esp32-cam-1' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to start sensing');
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
      setAlert({ type: 'success', message: 'Sensor started' });
    } catch (error) {
      console.error('Start sensing error:', error);
      setAlert({ type: 'error', message: error.message });
      setIsSensing(false);
      setSystemStatus('Idle');
    } finally {
      setIsLoading(false);
    }
  };

  const stopSensing = async () => {
    if (!isSensing || isLoading) return;
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ command: 'stop', device_id: 'esp32-cam-1' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to stop sensing');
      }

      setIsSensing(false);
      setSystemStatus('Idle');
      setTimer('');
      setAlert({ type: 'info', message: 'Sensor stopped' });
    } catch (error) {
      console.error('Stop sensing error:', error);
      setAlert({ type: 'error', message: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading || (!bottleCount && !canCount)) return;
    setIsLoading(true);

    const token = localStorage.getItem('token');
    if (!token || !userData.id) {
      setAlert({ type: 'error', message: 'Please log in to record recyclables' });
      setIsLoading(false);
      return;
    }

    try {
      const session = {
        user_id: userData.id,
        bottle_quantity: bottleCount,
        can_quantity: canCount,
        points_earned: pointsEarned,
        money_earned: parseFloat(moneyEarned),
      };

      const response = await fetch(`${API_URL}/api/insert-recyclables`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(session),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUserData({ name: 'Guest', points: 0, id: null });
          throw new Error('Session expired. Please log in again.');
        }
        throw new Error(errorData.message || 'Failed to record recyclables');
      }

      const { data } = await response.json();
      // Update user points locally
      const updatedUser = {
        ...user,
        points: (user.points || 0) + pointsEarned,
      };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUserData((prev) => ({
        ...prev,
        points: prev.points + pointsEarned,
      }));

      // Store locally as backup
      const sessions = JSON.parse(localStorage.getItem('recycling_sessions') || '[]');
      sessions.push({
        ...session,
        timestamp: new Date().toISOString(),
      });
      localStorage.setItem('recycling_sessions', JSON.stringify(sessions));

      setAlert({ type: 'success', message: 'Recyclables recorded successfully!' });
      resetSensorData();
      stopSensing();
    } catch (error) {
      console.error('Submit error:', error);
      setAlert({ type: 'error', message: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const resetSensorData = () => {
    setBottleCount(0);
    setCanCount(0);
    setQuantity(0);
    setMaterial('Unknown');
    setPointsEarned(0);
    setMoneyEarned(0);
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
                disabled={isSensing || isLoading}
              >
                <FontAwesomeIcon icon={faPlay} /> {isLoading ? 'Starting...' : 'Start Sensing'}
              </button>
              <button
                type="button"
                className="control-btn cancel-btn"
                onClick={stopSensing}
                style={{ display: isSensing ? 'block' : 'none' }}
                disabled={isLoading}
              >
                <FontAwesomeIcon icon={faStop} /> {isLoading ? 'Stopping...' : 'Cancel'}
              </button>
            </div>
            <button
              type="submit"
              className="control-btn submit-btn"
              disabled={isLoading || (!bottleCount && !canCount)}
            >
              {isLoading ? 'Saving...' : 'Add Recyclables'}
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
          <div className="stat-label">User: {userData.name}</div>
          <div className="stat-value">{userData.points} Points</div>
          <div className="stat-label">Total Points</div>
        </div>
      </div>
    </Layout>
  );
};

export default Insert;