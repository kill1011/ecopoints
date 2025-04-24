import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop, faSync } from '@fortawesome/free-solid-svg-icons';
import '../styles/Insert.css';

// Supabase configuration
const supabaseUrl = "https://xvxlddakxhircvunyhbt.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2eGxkZGFreGhpcmN2dW55aGJ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTAyMTYxMiwiZXhwIjoyMDYwNTk3NjEyfQ.tuAoIiYESiXPyCGaO5pDrA7vw7VeVfpuxiCXT0bt8Ck";
const supabase = createClient(supabaseUrl, supabaseKey);

const Insert = () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userId = localStorage.getItem('user_id');
  const deviceId = 'esp32-cam-1';

  const [userData, setUserData] = useState({ name: user.name || 'Guest', points: 0 });
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

  const startSensing = async () => {
    if (isSensing) return;
    setIsSensing(true);
    setSystemStatus('Scanning...');

    try {
      const { data, error } = await supabase
        .from('device_controls')
        .insert({
          device_id: deviceId,
          command: 'start',
          user_id: userId || null,
        });

      if (error) {
        throw new Error(`Failed to start sensing: ${error.message}`);
      }
      console.log('Start command sent:', data);
    } catch (error) {
      console.error('Error sending start command:', error);
      setAlert({ type: 'error', message: error.message });
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
      const { data, error } = await supabase
        .from('device_controls')
        .insert({
          device_id: deviceId,
          command: 'stop',
          user_id: userId || null,
        });

      if (error) {
        throw new Error(`Failed to stop sensing: ${error.message}`);
      }
      console.log('Stop command sent:', data);
    } catch (error) {
      console.error('Error sending stop command:', error);
      setAlert({ type: 'error', message: error.message });
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
    const payload = { bottle_quantity: bottleCount, can_quantity: canCount, user_id: userId };
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5433';
      const response = await fetch(`${apiUrl}/api/insert-recyclables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to add recyclables');
      }

      const result = await response.json();
      if (result.success) {
        setAlert({ type: 'success', message: 'Recyclables added successfully!' });
        resetSensorData();
        const userResponse = await fetch(`${apiUrl}/api/user/${userId}`);
        setUserData(await userResponse.json());
      } else {
        throw new Error(result.message || 'Failed to add recyclables');
      }
    } catch (error) {
      setAlert({ type: 'error', message: error.message });
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

  const fetchRecentRecyclables = async () => {
    try {
      const { data, error } = await supabase
        .from('recyclables')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        throw new Error(`Failed to fetch recyclables: ${error.message}`);
      }

      if (data && data.length > 0) {
        const { material, quantity, user_id } = data[0];
        console.log('Fetched recyclable:', data[0]);
        console.log('Current userId:', userId, 'Record user_id:', user_id);
        setMaterial(material);
        setQuantity(quantity);
        if (material === 'PLASTIC_BOTTLE') {
          setBottleCount(prev => {
            const newCount = prev + quantity;
            console.log('Updated Bottle Count (fetch):', newCount);
            return newCount;
          });
        } else if (material === 'CAN') {
          setCanCount(prev => {
            const newCount = prev + quantity;
            console.log('Updated Can Count (fetch):', newCount);
            return newCount;
          });
        }
        updateEarnings();
      } else {
        console.log('No recent recyclables found.');
      }
    } catch (error) {
      console.error('Error fetching recyclables:', error);
      setAlert({ type: 'error', message: error.message });
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!userId || !token) {
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

        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user_id');
          localStorage.removeItem('user');
          window.location.href = '/login';
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch user data: ${response.statusText}`);
        }

        const data = await response.json();
        setUserData(data);
      } catch (error) {
        console.error('Error fetching user data:', error);
        setAlert({ type: 'error', message: 'Failed to load user data.' });
      }
    };

    fetchUserData();

    // Subscribe to recyclables table for real-time updates
    const subscription = supabase
      .channel('public:recyclables')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'recyclables',
          filter: `device_id=eq.${deviceId}`,
        },
        (payload) => {
          const { material, quantity, user_id } = payload.new;
          console.log('New recyclable detected:', payload.new);
          console.log('Current userId:', userId, 'Record user_id:', user_id);
          // Temporarily remove user_id check for debugging
          // if (user_id !== userId) {
          //   console.log('Skipping entry: user_id does not match');
          //   return;
          // }
          setMaterial(material);
          setQuantity(quantity);
          console.log('Updated state - Material:', material, 'Quantity:', quantity, 'Bottle Count:', bottleCount, 'Can Count:', canCount);
          if (material === 'PLASTIC_BOTTLE') {
            setBottleCount(prev => {
              const newCount = prev + quantity;
              console.log('Updated Bottle Count (subscription):', newCount);
              return newCount;
            });
          } else if (material === 'CAN') {
            setCanCount(prev => {
              const newCount = prev + quantity;
              console.log('Updated Can Count (subscription):', newCount);
              return newCount;
            });
          }
          updateEarnings();
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to real-time updates for recyclables table.');
        } else if (status === 'CLOSED') {
          console.log('Subscription closed. Check network or Supabase configuration.');
        }
      });

    return () => {
      console.log('Unsubscribing from real-time updates');
      supabase.removeChannel(subscription);
    };
  }, [userId]);

  return (
    <Layout title="Insert Recyclables">
      <div className="insert-grid">
        <div className="status-card">
          <div className="stat-label"><FontAwesomeIcon icon={faRecycle} /> Sensor Status</div>
          <div className="stat-value" style={{ color: isSensing ? '#4caf50' : '#666' }}>{systemStatus}</div>
          <div className="stat-label">Material: {material}</div>
          <div className="stat-value">{quantity}</div>
          <div className="stat-label">Items Detected</div>
          <div className="stat-label">Plastic Bottles: {bottleCount}</div>
          <div className="stat-label">Cans: {canCount}</div>
          {alert.message && (
            <div className={`alert ${alert.type}`}>
              {alert.message}
            </div>
          )}
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
              <button
                type="button"
                className="control-btn refresh-btn"
                onClick={fetchRecentRecyclables}
              >
                <FontAwesomeIcon icon={faSync} /> Refresh
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