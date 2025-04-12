import React, { useState, useEffect, useContext } from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop } from '@fortawesome/free-solid-svg-icons';
import '../styles/Insert.css';
import { AuthContext } from '../context/AuthContext';

const API_URL = 'https://ecopoints-api.vercel.app/api'; // Your Vercel backend URL
const DEVICE_ID = 'esp32-cam-1';

const Insert = () => {
  const { user, token } = useContext(AuthContext);
  const [userData] = useState({ 
    name: user?.name || 'Guest', 
    points: user?.points || 0
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
  const [lastDetectionId, setLastDetectionId] = useState(null);

  useEffect(() => {
    let pollInterval;
    if (isSensing && token) {
      pollInterval = setInterval(async () => {
        try {
          const response = await fetch(`${API_URL}/recyclables`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
          const detections = await response.json();
          const newDetections = lastDetectionId
            ? detections.filter(d => d.id > lastDetectionId)
            : detections.slice(-1); // Get latest if no last ID
          if (newDetections.length > 0) {
            const latest = newDetections[newDetections.length - 1];
            setLastDetectionId(latest.id);
            if (latest.device_id === DEVICE_ID) {
              setMaterial(latest.material);
              setQuantity(prev => prev + latest.quantity);
              if (latest.material === 'bottle') {
                setBottleCount(prev => prev + latest.quantity);
              } else if (latest.material === 'can') {
                setCanCount(prev => prev + latest.quantity);
              }
              updateEarnings();
            }
          }
        } catch (error) {
          console.error('Polling error:', error);
          setAlert({ type: 'error', message: 'Failed to fetch sensor data' });
        }
      }, 2000); // Poll every 2 seconds
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isSensing, lastDetectionId, token]);

  const startSensing = async () => {
    if (isSensing || !token) {
      if (!token) {
        setAlert({ type: 'error', message: 'Please log in to start sensing' });
      }
      return;
    }
    try {
      const response = await fetch(`${API_URL}/control`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: 'start', device_id: DEVICE_ID })
      });
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
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
      console.error('Start error:', error);
      setAlert({ type: 'error', message: 'Failed to start sensor' });
    }
  };

  const stopSensing = async () => {
    if (token) {
      try {
        const response = await fetch(`${API_URL}/control`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ command: 'stop', device_id: DEVICE_ID })
        });
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      } catch (error) {
        console.error('Stop error:', error);
        setAlert({ type: 'error', message: 'Failed to stop sensor' });
      }
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
    if (!user?.id || !token) {
      setAlert({ type: 'error', message: 'Please log in to submit recyclables' });
      return;
    }
    try {
      const response = await fetch(`${API_URL}/insert-recyclables`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: user.id,
          bottle_quantity: bottleCount,
          can_quantity: canCount,
          points_earned: pointsEarned,
          money_earned: parseFloat(moneyEarned)
        })
      });
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const result = await response.json();
      if (result.success) {
        setAlert({ type: 'success', message: 'Recyclables recorded!' });
        resetSensorData();
        stopSensing();
      } else {
        setAlert({ type: 'error', message: result.message || 'Failed to record recyclables' });
      }
    } catch (error) {
      console.error('Submit error:', error);
      setAlert({ type: 'error', message: 'Failed to record recyclables' });
    }
  };

  const resetSensorData = () => {
    setBottleCount(0);
    setCanCount(0);
    setQuantity(0);
    setMaterial('Unknown');
    setPointsEarned(0);
    setMoneyEarned(0);
    setLastDetectionId(null);
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
                disabled={isSensing || !token}
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