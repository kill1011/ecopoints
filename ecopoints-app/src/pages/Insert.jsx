import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop } from '@fortawesome/free-solid-svg-icons';
import { supabase } from '../supabaseClient'; // Adjust path if needed
import '../styles/Insert.css';

const Insert = () => {
  const serialRef = useRef(null);
  const readerRef = useRef(null);
  const portRef = useRef(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const [userData, setUserData] = useState({ 
    name: user.name || 'Guest', 
    points: 0
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
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerInterval, setTimerInterval] = useState(null);

  const processSerialMessage = (message) => {
    console.log('Received from ESP32:', message);
    if (message.startsWith('SESSION_STARTED')) {
      setAlert({ type: 'info', message: 'Sensing session started successfully!' });
    } else if (message.startsWith('SESSION_ENDED')) {
      setAlert({ type: 'info', message: 'Sensing session ended.' });
      stopSensing();
    } else if (message.startsWith('DETECTED:')) {
      const detectedItem = message.split(':')[1]?.trim();
      if (!detectedItem) return;
      setMaterial(detectedItem);
      if (detectedItem === 'bottle') {
        setBottleCount(prev => prev + 1);
      } else if (detectedItem === 'can') {
        setCanCount(prev => prev + 1);
      }
      setQuantity(prev => prev + 1);
      updateEarnings(
        detectedItem === 'bottle' ? bottleCount + 1 : bottleCount,
        detectedItem === 'can' ? canCount + 1 : canCount
      );
    }
  };

  const connectToDevice = async () => {
    if (!('serial' in navigator)) {
      setAlert({ type: 'error', message: 'Web Serial API not supported in this browser' });
      return false;
    }
    try {
      portRef.current = await navigator.serial.requestPort();
      await portRef.current.open({ baudRate: 115200 });
      const decoder = new TextDecoderStream();
      readerRef.current = portRef.current.readable.pipeThrough(decoder).getReader();
      const readLoop = async () => {
        try {
          while (true) {
            const { value, done } = await readerRef.current.read();
            if (done) break;
            value.split('\n').forEach(line => {
              if (line.trim()) {
                processSerialMessage(line.trim());
              }
            });
          }
        } catch (error) {
          console.error('Serial read error:', error);
          setAlert({ type: 'error', message: 'Error reading from ESP32' });
        }
      };
      readLoop();
      return true;
    } catch (error) {
      console.error('Serial connect error:', error);
      setAlert({ type: 'error', message: 'Failed to connect to ESP32' });
      return false;
    }
  };

  const sendToESP32 = async (command) => {
    if (!portRef.current) {
      const connected = await connectToDevice();
      if (!connected) return false;
    }
    try {
      const encoder = new TextEncoder();
      const writer = portRef.current.writable.getWriter();
      await writer.write(encoder.encode(command + '\n'));
      writer.releaseLock();
      return true;
    } catch (error) {
      console.error('Serial write error:', error);
      setAlert({ type: 'error', message: 'Error sending command to ESP32' });
      return false;
    }
  };

  const startSensing = async () => {
    if (isSensing) return;
    const success = await sendToESP32('START');
    if (!success) return;
    setIsSensing(true);
    setSystemStatus('Scanning...');
    resetSensorData();
    setTimeLeft(30);
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          stopSensing();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    setTimerInterval(interval);
  };

  const stopSensing = async () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
    setIsSensing(false);
    setSystemStatus('Idle');
    setTimer('');
    await sendToESP32('STOP');
  };

  const updateEarnings = (bottles = bottleCount, cans = canCount) => {
    const points = bottles * 2 + cans * 3;
    const money = (bottles * 0.5 + cans * 0.75).toFixed(2);
    setPointsEarned(points);
    setMoneyEarned(money);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user.id) {
      setAlert({ type: 'error', message: 'You must be logged in to save recyclables' });
      return;
    }
    await stopSensing();
    try {
      const { data, error } = await supabase
        .from('recycling_sessions')
        .insert([
          { 
            user_id: user.id,
            bottle_count: bottleCount,
            can_count: canCount,
            points_earned: pointsEarned,
            money_value: parseFloat(moneyEarned)
          }
        ])
        .select();
      if (error) {
        console.error('Supabase insert error:', error.code, error.message, error.details);
        throw new Error(`Failed to save session: ${error.message}`);
      }
      const { data: userData, error: userError } = await supabase
        .from('users')
        .update({ points: user.points + pointsEarned })
        .eq('id', user.id)
        .select();
      if (userError) {
        console.error('Supabase update error:', userError.code, userError.message, userError.details);
        throw new Error(`Failed to update user: ${userError.message}`);
      }
      const updatedUser = { ...user, points: user.points + pointsEarned };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUserData(updatedUser);
      setAlert({ type: 'success', message: 'Recyclables added successfully!' });
      resetSensorData();
    } catch (error) {
      console.error('Submit error:', error.message);
      setAlert({ type: 'error', message: error.message });
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

  useEffect(() => {
    if (isSensing) {
      setTimer(`Time Left: ${timeLeft}s`);
    }
  }, [timeLeft, isSensing]);

  useEffect(() => {
    const fetchUserData = async (retries = 3, delay = 2000) => {
      if (!user?.id) {
        console.warn('No user ID in localStorage, skipping fetch');
        setAlert({ type: 'warning', message: 'Please log in to view user data' });
        setUserData({ name: 'Guest', points: 0 });
        return;
      }
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          console.log(`Attempt ${attempt}: Fetching user data for ID: ${user.id}`);
          const { data, error } = await supabase
            .from('users')
            .select('id, name, email, points, is_admin')
            .eq('id', user.id)
            .single();
          if (error) {
            console.error('Supabase error:', {
              code: error.code,
              message: error.message,
              details: error.details,
              hint: error.hint
            });
            throw new Error(`Failed to fetch user data: ${error.message}`);
          }
          if (!data) {
            console.warn('No user found for ID:', user.id);
            throw new Error('User not found in database');
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
              message: `Unable to load user data after ${retries} attempts: ${error.message}` 
            });
            setUserData({ name: 'Guest', points: 0 });
          }
        }
      }
    };
    fetchUserData();
    return () => {
      if (readerRef.current) {
        readerRef.current.cancel().catch(() => {});
      }
      if (portRef.current) {
        if (portRef.current.readable?.locked) {
          readerRef.current.releaseLock();
        }
        if (portRef.current.writable?.locked) {
          portRef.current.writable.getWriter().releaseLock();
        }
        portRef.current.close().catch(() => {});
      }
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [user.id]);

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