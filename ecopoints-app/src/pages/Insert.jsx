import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop } from '@fortawesome/free-solid-svg-icons';
import '../styles/Insert.css';

const WS_URL = 'ws://192.168.254.110'; // Replace with your ESP32-CAM's IP address

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
  const [ws, setWs] = useState(null);

  useEffect(() => {
    const websocket = new WebSocket(WS_URL);

    websocket.onopen = () => {
      console.log('Connected to ESP32-CAM WebSocket');
      setAlert({ type: 'info', message: 'Connected to sensor' });
    };

    websocket.onmessage = (event) => {
      console.log('WebSocket message:', event.data);
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'detection' && data.device_id === 'esp32-cam-1') {
          const { material: detectedMaterial, quantity: detectedQuantity } = data;
          setMaterial(detectedMaterial);
          setQuantity(prev => prev + detectedQuantity);
          if (detectedMaterial === 'bottle') {
            setBottleCount(prev => prev + detectedQuantity);
          } else if (detectedMaterial === 'can') {
            setCanCount(prev => prev + detectedQuantity);
          }
          updateEarnings();
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      setAlert({ type: 'error', message: 'Sensor connection failed' });
    };

    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      setAlert({ type: 'warning', message: 'Disconnected from sensor' });
    };

    setWs(websocket);

    return () => {
      websocket.close();
      stopSensing();
    };
  }, []);

  const startSensing = () => {
    if (isSensing || !ws) return;
    setIsSensing(true);
    setSystemStatus('Scanning...');
    ws.send(JSON.stringify({ command: 'start' }));
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
    if (!ws) return;
    setIsSensing(false);
    setSystemStatus('Idle');
    setTimer('');
    ws.send(JSON.stringify({ command: 'stop' }));
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
                disabled={isSensing || !ws}
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