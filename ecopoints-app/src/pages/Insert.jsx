import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop, faSync } from '@fortawesome/free-solid-svg-icons';
import '../styles/Insert.css';

// Supabase configuration
const supabaseUrl = "https://xvxlddakxhircvunyhbt.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2eGxkZGFreGhpcmN2dW55aGJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwMjE2MTIsImV4cCI6MjA2MDU5NzYxMn0.daBvBBLDOngBEgjnz8ijnIWYFEqCh612xG_r_Waxfeo";
const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 10, // Adjust if hitting rate limits
    },
  }
});

const Insert = () => {
  const [user, setUser] = useState(null);
  const userId = user?.id || '2a4702d4-90e7-4cc0-be97-b63b9da69dc9';
  const deviceId = 'esp32-cam-1';

  const initialStats = JSON.parse(localStorage.getItem('userStats')) || {
    totalBottleCount: 0,
    totalCanCount: 0,
    totalPoints: 0,
    totalMoney: 0,
  };

  const [userData, setUserData] = useState({ name: 'Guest', points: 0 });
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
  const [totalBottleCount, setTotalBottleCount] = useState(initialStats.totalBottleCount);
  const [totalCanCount, setTotalCanCount] = useState(initialStats.totalCanCount);
  const [totalPoints, setTotalPoints] = useState(initialStats.totalPoints);
  const [totalMoney, setTotalMoney] = useState(initialStats.totalMoney);
  const [recentDetections, setRecentDetections] = useState([]);
  const subscriptionRef = useRef(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      console.log('Authenticated user:', user, 'Auth error:', error);
      setUser(user);
      if (error || !user) {
        setAlert({ type: 'error', message: 'User not authenticated. Redirecting to login...' });
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else {
        setUserData({ name: user.user_metadata?.name || 'Guest', points: 0 });
      }
    };
    checkAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session);
      setUser(session?.user || null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const startSensing = async () => {
    if (isSensing || !user) return;
    setIsSensing(true);
    setSystemStatus('Scanning...');

    try {
      const { data, error } = await supabase
        .from('device_controls')
        .insert({
          device_id: deviceId,
          command: 'start',
          user_id: userId,
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
          user_id: userId,
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

  const updateEarnings = (bottleCount, canCount) => {
    const points = bottleCount * 2 + canCount * 3;
    const money = (bottleCount * 0.5 + canCount * 0.75).toFixed(2);
    console.log('Updating earnings - Bottle Count:', bottleCount, 'Can Count:', canCount, 'Points:', points, 'Money:', money);
    setPointsEarned(points);
    setMoneyEarned(money);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('Submitting - Bottle Count:', bottleCount, 'Can Count:', canCount, 'Points Earned:', pointsEarned, 'Money Earned:', moneyEarned);

    setTotalBottleCount(prev => prev + bottleCount);
    setTotalCanCount(prev => prev + canCount);
    setTotalPoints(prev => prev + pointsEarned);
    setTotalMoney(prev => (parseFloat(prev) + parseFloat(moneyEarned)).toFixed(2));

    setUserData(prev => ({
      ...prev,
      points: prev.points + pointsEarned,
    }));

    const updatedStats = {
      totalBottleCount: totalBottleCount + bottleCount,
      totalCanCount: totalCanCount + canCount,
      totalPoints: totalPoints + pointsEarned,
      totalMoney: (parseFloat(totalMoney) + parseFloat(moneyEarned)).toFixed(2),
    };
    console.log('Saving to localStorage:', updatedStats);
    localStorage.setItem('userStats', JSON.stringify(updatedStats));

    setAlert({ type: 'success', message: 'Recyclables added successfully!' });
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
    setRecentDetections([]);
  };

  const fetchRecentRecyclables = async () => {
    try {
      const timeThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('recyclables')
        .select('*')
        .eq('device_id', deviceId)
        .gte('created_at', timeThreshold)
        .order('created_at', { ascending: false });

      console.log('FetchRecentRecyclables - User:', user, 'Data:', data, 'Error:', error);

      if (error) {
        throw new Error(`Failed to fetch recyclables: ${error.message}`);
      }

      if (data && data.length > 0) {
        console.log('Fetched recyclables:', data);
        setRecentDetections(data);

        let newBottleCount = 0;
        let newCanCount = 0;
        data.forEach(record => {
          console.log('Processing record:', record);
          if (record.material === 'PLASTIC_BOTTLE') {
            newBottleCount += record.quantity;
          } else if (record.material === 'CAN') {
            newCanCount += record.quantity;
          }
          setMaterial(record.material);
          setQuantity(record.quantity);
        });

        console.log('Aggregated - Bottle Count:', newBottleCount, 'Can Count:', newCanCount);
        setBottleCount(newBottleCount);
        setCanCount(newCanCount);
        updateEarnings(newBottleCount, newCanCount);
      } else {
        console.log('No recent recyclables found for device_id:', deviceId);
        setAlert({ type: 'info', message: 'No recent recyclables found.' });
        setMaterial('Unknown');
        setQuantity(0);
      }
    } catch (error) {
      console.error('Error fetching recyclables:', error);
      setAlert({ type: 'error', message: error.message });
    }
  };

  useEffect(() => {
    if (!user) return;

    console.log('useEffect - userId:', userId, 'deviceId:', deviceId);

    fetchRecentRecyclables();

    let retryCount = 0;
    const maxRetries = 5;
    const baseRetryDelay = 5000;

    const subscribe = () => {
      console.log('Attempting to subscribe to real-time updates...');
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }

      subscriptionRef.current = supabase
        .channel(`public:recyclables:device_id=eq.${deviceId}`, {
          config: {
            broadcast: { ack: true },
            presence: { key: userId },
          },
        })
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'recyclables',
            filter: `device_id=eq.${deviceId}`,
          },
          (payload) => {
            console.log('Real-time event received:', payload);
            const { material, quantity, user_id, created_at } = payload.new;
            console.log('New recyclable:', { material, quantity, user_id, created_at });

            setRecentDetections(prev => [
              { material, quantity, user_id, created_at },
              ...prev.slice(0, 4),
            ]);

            setMaterial(material);
            setQuantity(quantity);
            if (material === 'PLASTIC_BOTTLE') {
              setBottleCount(prev => {
                const newCount = prev + quantity;
                console.log('Real-time - Updated Bottle Count:', newCount);
                updateEarnings(newCount, canCount);
                return newCount;
              });
            } else if (material === 'CAN') {
              setCanCount(prev => {
                const newCount = prev + quantity;
                console.log('Real-time - Updated Can Count:', newCount);
                updateEarnings(bottleCount, newCount);
                return newCount;
              });
            }
          }
        )
        .subscribe((status, err) => {
          console.log('Subscription status:', status, 'Error:', err ? err.message : 'No error details');
          if (status === 'SUBSCRIBED') {
            console.log('Successfully subscribed to real-time updates for recyclables.');
            setAlert({ type: 'success', message: 'Real-time subscription active.' });
            retryCount = 0;
          } else if (status === 'CLOSED') {
            console.error('Subscription closed:', err ? err.message : 'No error details');
            setAlert({ type: 'error', message: 'Real-time subscription failed. Use Refresh.' });
            if (retryCount < maxRetries) {
              const delay = baseRetryDelay * Math.pow(2, retryCount);
              console.log(`Retrying subscription (${retryCount + 1}/${maxRetries}) in ${delay}ms...`);
              setTimeout(subscribe, delay);
              retryCount++;
            } else {
              console.error('Max retry attempts reached. Subscription failed.');
              setAlert({ type: 'error', message: 'Real-time subscription failed permanently. Use Refresh.' });
            }
          } else if (status === 'TIMED_OUT') {
            console.error('Subscription timed out:', err ? err.message : 'No error details');
            setAlert({ type: 'error', message: 'Real-time subscription timed out. Retrying...' });
            if (retryCount < maxRetries) {
              const delay = baseRetryDelay * Math.pow(2, retryCount);
              console.log(`Retrying subscription (${retryCount + 1}/${maxRetries}) in ${delay}ms...`);
              setTimeout(subscribe, delay);
              retryCount++;
            }
          } else {
            console.log('Subscription status changed:', status);
          }
        });
    };

    subscribe();

    const interval = setInterval(fetchRecentRecyclables, 5000);

    return () => {
      console.log('Unsubscribing from real-time updates');
      clearInterval(interval);
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [user, userId, bottleCount, canCount]);

  return (
    <Layout title="Insert Recyclables">
      <div className="insert-grid">
        <div className="status-card">
          <div className="stat-label"><FontAwesomeIcon icon={faRecycle} /> Sensor Status</div>
          <div className="stat-value" style={{ color: isSensing ? '#4caf50' : '#666' }}>{systemStatus}</div>
          <div className="stat-label">Latest Material: {material}</div>
          <div className="stat-value">Quantity: {quantity}</div>
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
                disabled={isSensing || !user}
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

        <div className="stats-card">
          <div className="stat-label">Total Statistics</div>
          <div className="stat-label">Total Plastic Bottles: {totalBottleCount}</div>
          <div className="stat-label">Total Cans: {totalCanCount}</div>
          <div className="stat-label">Total Points: {totalPoints}</div>
          <div className="stat-label">Total Money: ₱{totalMoney}</div>
        </div>

        <div className="history-card">
          <div className="stat-label">Recent Detections</div>
          {recentDetections.length > 0 ? (
            <ul>
              {recentDetections.map((detection, index) => (
                <li key={index}>
                  {detection.material} (Qty: {detection.quantity}) at {new Date(detection.created_at).toLocaleTimeString()}
                </li>
              ))}
            </ul>
          ) : (
            <p>No recent detections.</p>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Insert;