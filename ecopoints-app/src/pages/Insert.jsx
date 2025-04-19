import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop } from '@fortawesome/free-solid-svg-icons';
import '../styles/Insert.css';

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

  const startSensing = () => {
    if (isSensing) return;
    setIsSensing(true);
    setSystemStatus('Scanning...');
    let timeLeft = 30; // 30-second scan cycle
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { bottle_quantity: bottleCount, can_quantity: canCount };
    try {
      const response = await fetch('/api/insert-recyclables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.success) {
        setAlert({ type: 'success', message: 'Recyclables added successfully!' });
        resetSensorData();
        const userId = localStorage.getItem('user_id');
        const userResponse = await fetch(`/api/user/${userId}`);
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
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}/api/user-stats/${userId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        const contentType = response.headers.get('Content-Type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Server did not return JSON. Check if the endpoint exists and the server is running.');
        }

        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user_id');
          localStorage.removeItem('user');
          window.location.href = '/login';
          return;
        }
        if (!response.ok) {
          throw new Error('Failed to fetch user data');
        }

        const data = await response.json();
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

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

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