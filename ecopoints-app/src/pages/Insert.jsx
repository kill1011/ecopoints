import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop } from '@fortawesome/free-solid-svg-icons';
import Pusher from 'pusher-js';
import '../styles/Insert.css';

const PUSHER_KEY = '528b7d374844d8b54864'; // Your apiKey
const PUSHER_CLUSTER = 'ap1'; // Your cluster

const Insert = () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [userData] = useState({ 
    name: user.name || 'Guest', 
    points: user.points || 0
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

  useEffect(() => {
    const pusher = new Pusher(PUSHER_KEY, {
      cluster: PUSHER_CLUSTER,
      forceTLS: true
    });

    const channel = pusher.subscribe('ecopoints');

    channel.bind('detection', (data) => {
      console.log('Pusher detection:', data);
      const { material: detectedMaterial, quantity: detectedQuantity, device_id } = data;
      if (device_id === 'esp32-cam-1') {
        setMaterial(detectedMaterial);
        setQuantity(prev => prev + detectedQuantity);
        if (detectedMaterial === 'bottle') {
          setBottleCount(prev => prev + detectedQuantity);
        } else if (detectedMaterial === 'can') {
          setCanCount(prev => prev + detectedQuantity);
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

  const startSensing = async () => {
    if (isSensing) return;
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
  };

  const stopSensing = () => {
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

  const handleSubmit = (e) => {
    e.preventDefault();
    const session = {
      bottle_count: bottleCount,
      can_count: canCount,
      points_earned: pointsEarned,
      money_earned: parseFloat(moneyEarned),
      timestamp: new Date().toISOString()
    };
    const sessions = JSON.parse(localStorage.getItem('recycling_sessions') || '[]');
    sessions.push(session);
    localStorage.setItem('recycling_sessions', JSON.stringify(sessions));
    
    setAlert({ type: 'success', message: 'Recyclables recorded locally!' });
    resetSensorData();
    stopSensing();
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