import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop, faSync } from '@fortawesome/free-solid-svg-icons';
import '../styles/Insert.css';

// Supabase configuration
const supabaseUrl = "https://xvxlddakxhircvunyhbt.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2eGxkZGFreGhpcmN2dW55aGJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwMjE2MTIsImV4cCI6MjA2MDU5NzYxMn0.daBvBBLDOngBEgjnz8ijnIWYFEqCh612xG_r_Waxfeo";
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

const Insert = () => {
  const [user, setUser] = useState(null);
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
  const [deviceId, setDeviceId] = useState('');
  const initialStats = JSON.parse(localStorage.getItem('userStats')) || {
    totalBottleCount: 0,
    totalCanCount: 0,
    totalPoints: 0,
    totalMoney: 0,
  };
  const [totalBottleCount, setTotalBottleCount] = useState(initialStats.totalBottleCount);
  const [totalCanCount, setTotalCanCount] = useState(initialStats.totalCanCount);
  const [totalPoints, setTotalPoints] = useState(initialStats.totalPoints);
  const [totalMoney, setTotalMoney] = useState(initialStats.totalMoney);
  const [recentDetections, setRecentDetections] = useState([]);
  const subscriptionRef = useRef(null);

  // Check authentication and refresh session
  useEffect(() => {
    const checkAuth = async () => {
      console.log('Checking authentication...');
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      console.log('Session refresh:', refreshData, 'Refresh Error:', refreshError);
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      console.log('Session:', session, 'Session Error:', sessionError);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      console.log('Authenticated user:', user, 'User Error:', userError);
      
      if (refreshError || sessionError || !session || !session.user || userError || !user) {
        console.error('Authentication failed. Redirecting to login.');
        setAlert({ type: 'error', message: 'User not authenticated. Redirecting to login...' });
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
        return;
      }
      
      setUser(user);
      setUserData({ name: user.user_metadata?.name || 'Guest', points: 0 });
      console.log('User set:', user.id);
    };
    checkAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, 'Session:', session);
      if (session && session.user) {
        setUser(session.user);
        setUserData({ name: session.user.user_metadata?.name || 'Guest', points: 0 });
        console.log('Session updated. User ID:', session.user.id);
      } else {
        console.error('No session or user. Redirecting to login.');
        setUser(null);
        setAlert({ type: 'error', message: 'Session expired. Redirecting to login...' });
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Start sensing
  const startSensing = async () => {
    console.log('startSensing called. User:', user);
    if (!user || !user.id) {
      console.error('Cannot start sensing: No authenticated user.');
      setAlert({ type: 'error', message: 'You must be logged in to start sensing.' });
      return;
    }
    if (isSensing) {
      console.log('Already sensing. Ignoring request.');
      return;
    }

    console.log('User ID:', user.id, 'User Email:', user.email);
    const { data: { session } } = await supabase.auth.getSession();
    console.log('Current Session:', session);

    let newDeviceId = '438b2bf0-0158-4b62-a969-3d8b239a36ad';
    console.log('Using ESP32 device_id:', newDeviceId);

    const { data: existingDevice, error: checkError } = await supabase
      .from('devices')
      .select('user_id')
      .eq('device_id', newDeviceId)
      .single();
    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking device:', checkError);
      setAlert({ type: 'error', message: 'Failed to check device.' });
      return;
    }
    if (existingDevice && existingDevice.user_id !== user.id) {
      console.log('Device ID exists for another user. Generating new device_id.');
      newDeviceId = uuidv4();
    }

    setDeviceId(newDeviceId);
    setIsSensing(true);
    setSystemStatus('Scanning...');
    console.log('Inserting start command for user:', user.id, 'Device ID:', newDeviceId);

    try {
      const sessionId = uuidv4();
      console.log('Session ID:', sessionId);

      const { data: sessionData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('Session refresh failed:', refreshError);
        throw new Error(`Failed to refresh session: ${refreshError.message}`);
      }
      console.log('Session refreshed:', sessionData);

      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;
      if (!authToken) {
        throw new Error('Failed to get auth token');
      }

      console.log('Upserting device:', { device_id: newDeviceId, user_id: user.id });
      const { error: deviceError } = await supabase
        .from('devices')
        .upsert([
          { device_id: newDeviceId, user_id: user.id }
        ], { onConflict: 'device_id' });
      if (deviceError) {
        console.error('Error registering device:', deviceError);
        throw new Error(`Failed to register device: ${deviceError.message}`);
      }
      console.log('Device registered:', newDeviceId);

      const payload = {
        device_id: newDeviceId,
        command: 'start',
        user_id: user.id,
        session_id: sessionId,
        auth_token: authToken,
      };
      console.log('Inserting device control:', payload);
      const { data, error } = await supabase
        .from('device_controls')
        .insert(payload)
        .select();

      if (error) {
        console.error('Supabase insert error:', error);
        throw new Error(`Failed to start sensing: ${error.message}`);
      }

      console.log('Start command inserted:', data);
      setAlert({ type: 'success', message: 'Sensing started.' });
    } catch (error) {
      console.error('Error in startSensing:', error);
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

  // Stop sensing
  const stopSensing = async () => {
    console.log('stopSensing called. User:', user);
    if (!user || !user.id) {
      console.error('Cannot stop sensing: No authenticated user.');
      setAlert({ type: 'error', message: 'You must be logged in to stop sensing.' });
      return;
    }

    console.log('User ID:', user.id, 'Device ID:', deviceId);

    setIsSensing(false);
    setSystemStatus('Idle');
    setTimer('');

    try {
      const { data: sessionData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('Session refresh failed:', refreshError);
        throw new Error('Session refresh failed');
      }
      console.log('Session refreshed:', sessionData);

      const sessionId = uuidv4();
      console.log('Generated session_id:', sessionId);
      const payload = {
        device_id: deviceId,
        command: 'stop',
        user_id: user.id,
        session_id: sessionId,
      };
      console.log('Inserting stop command:', payload);

      const { data, error } = await supabase
        .from('device_controls')
        .insert(payload)
        .select();

      if (error) {
        console.error('Supabase stop error:', error);
        throw new Error(`Failed to stop sensing: ${error.message} (Code: ${error.code || 'N/A'})`);
      }
      console.log('Stop command inserted:', data);
      setAlert({ type: 'success', message: 'Sensing stopped.' });
    } catch (error) {
      console.error('Error in stopSensing:', error);
      setAlert({ type: 'error', message: `Failed to stop sensing: ${error.message}` });
    }
  };

  // Update earnings
  const updateEarnings = (bottleCount, canCount) => {
    const points = bottleCount * 2 + canCount * 3;
    const money = (bottleCount * 0.5 + canCount * 0.75).toFixed(2);
    console.log('Updating earnings - Bottle Count:', bottleCount, 'Can Count:', canCount, 'Points:', points, 'Money:', money);
    setPointsEarned(points);
    setMoneyEarned(money);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('handleSubmit called. User:', user);
    if (!user || !user.id) {
      console.error('Cannot submit: No authenticated user.');
      setAlert({ type: 'error', message: 'You must be logged in to submit recyclables.' });
      return;
    }

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

  // Reset sensor data
  const resetSensorData = () => {
    setBottleCount(0);
    setCanCount(0);
    setQuantity(0);
    setMaterial('Unknown');
    setPointsEarned(0);
    setMoneyEarned(0);
    setRecentDetections([]);
  };

  // Fetch recent recyclables
  const fetchRecentRecyclables = async () => {
    console.log('fetchRecentRecyclables called. User:', user);
    if (!user || !user.id) {
      console.error('Cannot fetch recyclables: No authenticated user.');
      setAlert({ type: 'error', message: 'You must be logged in to fetch recyclables.' });
      return;
    }

    try {
      const timeThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('recyclables')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', timeThreshold)
        .order('created_at', { ascending: false });

      console.log('fetchRecentRecyclables - User ID:', user.id, 'Data:', data, 'Error:', error);

      if (error) {
        console.error('Supabase fetch error:', error);
        throw new Error(`Failed to fetch recyclables: ${error.message} (Code: ${error.code || 'N/A'})`);
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
          if (!deviceId && record.device_id) {
            setDeviceId(record.device_id);
          }
        });

        console.log('Aggregated - Bottle Count:', newBottleCount, 'Can Count:', newCanCount);
        setBottleCount(newBottleCount);
        setCanCount(newCanCount);
        updateEarnings(newBottleCount, newCanCount);
      } else {
        console.log('No recent recyclables found for user_id:', user.id);
        setAlert({ type: 'info', message: 'No recent recyclables found.' });
        setMaterial('Unknown');
        setQuantity(0);
      }
    } catch (error) {
      console.error('Error fetching recyclables:', error);
      setAlert({ type: 'error', message: error.message });
    }
  };

  // Real-time subscription and periodic fetch
  useEffect(() => {
    console.log('Real-time subscription useEffect. User:', user);
    if (!user || !user.id) {
      console.error('Cannot subscribe to real-time updates: No authenticated user.');
      return;
    }

    console.log('Setting up real-time subscription for user:', user.id);

    fetchRecentRecyclables();

    let retryCount = 0;
    const maxRetries = 5;
    const baseRetryDelay = 5000;

    const subscribe = () => {
      console.log('Subscribing to real-time updates for user:', user.id);
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }

      subscriptionRef.current = supabase
        .channel(`public:recyclables:user_id=eq.${user.id}`, {
          config: {
            broadcast: { ack: true },
            presence: { key: user.id },
          },
        })
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'recyclables',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('Real-time event received for user:', user.id, 'Payload:', payload);
            const { material, quantity, user_id, created_at, device_id } = payload.new;
            console.log('New recyclable:', { material, quantity, user_id, created_at, device_id });

            setRecentDetections(prev => [
              { material, quantity, user_id, created_at, device_id },
              ...prev.slice(0, 4),
            ]);

            setMaterial(material);
            setQuantity(quantity);
            if (!deviceId && device_id) {
              setDeviceId(device_id);
            }
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
          console.log('Subscription status:', status, 'Error:', err ? err.message : 'No error');
          if (status === 'KILL') {
            console.error('Subscription killed:', err ? err.message : 'No error details');
            if (retryCount < maxRetries) {
              const delay = baseRetryDelay * Math.pow(2, retryCount);
              console.log(`Retrying subscription (${retryCount + 1}/${maxRetries}) in ${delay}ms...`);
              setTimeout(subscribe, delay);
              retryCount++;
            } else {
              console.error('Max retry attempts reached. Subscription failed.');
            }
          } else if (status === 'TIMED_OUT') {
            console.error('Subscription timed out:', err ? err.message : 'No error details');
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
      console.log('Cleaning up real-time subscription');
      clearInterval(interval);
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [user, bottleCount, canCount]);

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
                disabled={!user}
              >
                <FontAwesomeIcon icon={faSync} /> Refresh
              </button>
            </div>
            <button type="submit" className="control-btn submit-btn" disabled={!isSensing || !user}>
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