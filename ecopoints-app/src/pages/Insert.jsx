// src/pages/Insert.js
import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop } from '@fortawesome/free-solid-svg-icons';
import { supabase } from '../supabaseClient';
import '../styles/Insert.css';

const Insert = () => {
  // Serial connection to ESP32
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

  // Handle incoming messages from ESP32
  const processSerialMessage = (message) => {
    console.log('Received from ESP32:', message);
    
    if (message.startsWith('SESSION_STARTED')) {
      setAlert({ type: 'info', message: 'Sensing session started successfully!' });
    } 
    else if (message.startsWith('SESSION_ENDED')) {
      setAlert({ type: 'info', message: 'Sensing session ended.' });
      stopSensing();
    }
    else if (message.startsWith('DETECTED:')) {
      const detectedItem = message.split(':')[1];
      setMaterial(detectedItem);
      
      if (detectedItem === 'bottle') {
        setBottleCount(prev => prev + 1);
      } else if (detectedItem === 'can') {
        setCanCount(prev => prev + 1);
      }
      
      // Update total detected items
      setQuantity(prev => prev + 1);
      
      // Update earnings preview in real-time
      updateEarnings(
        detectedItem === 'bottle' ? bottleCount + 1 : bottleCount,
        detectedItem === 'can' ? canCount + 1 : canCount
      );
    }
  };

  // Connect to the ESP32 through Serial Web API
  const connectToDevice = async () => {
    if ('serial' in navigator) {
      try {
        portRef.current = await navigator.serial.requestPort();
        await portRef.current.open({ baudRate: 115200 });
        
        const decoder = new TextDecoderStream();
        readerRef.current = portRef.current.readable.pipeThrough(decoder).getReader();
        
        // Read serial data loop
        const readLoop = async () => {
          try {
            while (true) {
              const { value, done } = await readerRef.current.read();
              if (done) break;
              
              // Process each line
              value.split('\n').forEach(line => {
                if (line.trim()) {
                  processSerialMessage(line.trim());
                }
              });
            }
          } catch (error) {
            console.error('Error reading from serial port:', error);
            setAlert({ type: 'error', message: 'Error reading from ESP32 device' });
          }
        };
        
        readLoop();
        return true;
      } catch (error) {
        console.error('Failed to connect to ESP32:', error);
        setAlert({ type: 'error', message: 'Could not connect to ESP32 device' });
        return false;
      }
    } else {
      setAlert({ type: 'error', message: 'Web Serial API is not supported in this browser' });
      return false;
    }
  };

  // Send command to ESP32
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
      console.error('Error writing to serial port:', error);
      setAlert({ type: 'error', message: 'Error sending command to ESP32' });
      return false;
    }
  };

  const startSensing = async () => {
    if (isSensing) return;
    
    // Connect and send start command to ESP32
    const success = await sendToESP32('START');
    if (!success) return;
    
    setIsSensing(true);
    setSystemStatus('Scanning...');
    resetSensorData();
    
    // Start timer countdown
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
    
    // Let ESP32 know we're stopping
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
    
    // First stop the sensing session
    await stopSensing();
    
    // Save to Supabase directly
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
        ]);
      
      if (error) throw error;
      
      // Update user points in Supabase
      const { data: userData, error: userError } = await supabase
        .from('users')
        .update({ points: user.points + pointsEarned })
        .eq('id', user.id)
        .select();
      
      if (userError) throw userError;
      
      // Update local storage with new points
      const updatedUser = { ...user, points: user.points + pointsEarned };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
      setAlert({ type: 'success', message: 'Recyclables added successfully!' });
      resetSensorData();
      
    } catch (error) {
      console.error('Error saving recyclables:', error);
      setAlert({ type: 'error', message: 'Failed to save recyclables: ' + error.message });
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

  // Display timer while sensing
  useEffect(() => {
    if (isSensing) {
      setTimer(`Time Left: ${timeLeft}s`);
    }
  }, [timeLeft, isSensing]);

  // Fetch user data on component mount
  useEffect(() => {
    const fetchUserData = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (error) {
        console.error('Error fetching user data:', error);
        setAlert({ type: 'error', message: 'Failed to load user data' });
      } else if (data) {
        setUserData(data);
      }
    };

    if (user.id) {
      fetchUserData();
    }

    // Clean up serial connection when component unmounts
    return () => {
      if (readerRef.current) {
        readerRef.current.cancel();
      }
      if (portRef.current?.readable?.locked) {
        readerRef.current.releaseLock();
      }
      if (portRef.current?.writable?.locked) {
        portRef.current.writable.getWriter().releaseLock();
      }
      if (portRef.current && portRef.current.close) {
        portRef.current.close();
      }
      if (timerInterval) {
        clearInterval(timerInterval);
      }
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