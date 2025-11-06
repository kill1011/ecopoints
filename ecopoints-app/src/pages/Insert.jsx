import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const [deviceId] = useState('esp32-cam-1');
  const [totalBottleCount, setTotalBottleCount] = useState(0);
  const [totalCanCount, setTotalCanCount] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [totalMoney, setTotalMoney] = useState(0);
  const [recentDetections, setRecentDetections] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [hasNewData, setHasNewData] = useState(false);
  const timerRef = useRef(null);
  const commandDebounceRef = useRef(null);
  const pollRef = useRef(null);

  const resetSensorData = useCallback(() => {
    setBottleCount(0);
    setCanCount(0);
    setQuantity(0);
    setMaterial('Unknown');
    setPointsEarned(0);
    setMoneyEarned(0);
    setRecentDetections([]);
    setHasNewData(false);
  }, []);

  const fetchMaterialValues = useCallback(async (material) => {
    try {
      const { data, error } = await supabase
        .from('recyclables')
        .select('points_per_piece, price_per_piece')
        .eq('material', material)
        .limit(1)
        .single();

      if (error) {
        console.error('Error fetching material values:', error);
        return { points_per_piece: 0, price_per_piece: 0 };
      }

      return {
        points_per_piece: data?.points_per_piece || 0,
        price_per_piece: data?.price_per_piece || 0,
      };
    } catch (error) {
      console.error('Unexpected error fetching material values:', error);
      return { points_per_piece: 0, price_per_piece: 0 };
    }
  }, []);

  const updateEarnings = useCallback(async (bottleCount, canCount) => {
    let totalPoints = 0;
    let totalMoney = 0;

    if (bottleCount > 0) {
      const { points_per_piece, price_per_piece } = await fetchMaterialValues('PLASTIC_BOTTLE');
      totalPoints += bottleCount * points_per_piece;
      totalMoney += bottleCount * price_per_piece;
    }

    if (canCount > 0) {
      const { points_per_piece, price_per_piece } = await fetchMaterialValues('CAN');
      totalPoints += canCount * points_per_piece;
      totalMoney += canCount * price_per_piece;
    }

    totalMoney = totalMoney.toFixed(2);
    setPointsEarned(totalPoints);
    setMoneyEarned(totalMoney);
    return { points: totalPoints, money: totalMoney };
  }, [fetchMaterialValues]);

  const fetchRecentRecyclables = useCallback(async () => {
    if (!user || !currentSessionId) {
      console.log('fetchRecentRecyclables: No user or session ID.');
      setAlert({ type: 'error', message: 'Please start a new session.' });
      return;
    }

    try {
      console.log('Fetching recent recyclables for user:', user.id, 'session:', currentSessionId);
      const { data, error } = await supabase
        .from('recyclables')
        .select('material, quantity, created_at, device_id, session_id')
        .eq('user_id', user.id)
        .eq('session_id', currentSessionId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('fetchRecentRecyclables error:', error);
        throw new Error(`Failed to fetch recyclables: ${error.message}`);
      }

      console.log('Recent recyclables:', data);
      if (data?.length > 0) {
        setRecentDetections(data);
        let newBottleCount = 0;
        let newCanCount = 0;
        data.forEach(record => {
          if (record.material === 'PLASTIC_BOTTLE') {
            newBottleCount += record.quantity;
          } else if (record.material === 'CAN') {
            newCanCount += record.quantity;
          }
          setMaterial(record.material);
          setQuantity(record.quantity);
        });
        setBottleCount(newBottleCount);
        setCanCount(newCanCount);
        await updateEarnings(newBottleCount, newCanCount);
        setHasNewData(true);
      } else {
        console.log('No recent recyclables found for user:', user.id, 'session:', currentSessionId);
        setAlert({ type: 'info', message: 'No new recyclables detected in this session.' });
        resetSensorData();
      }
    } catch (error) {
      console.error('fetchRecentRecyclables error:', error);
      setAlert({ type: 'error', message: error.message });
    }
  }, [user, currentSessionId, updateEarnings, resetSensorData]);

  const checkExistingCommands = useCallback(async () => {
    if (!user) {
      console.log('checkExistingCommands: No user, skipping.');
      return false;
    }
    try {
      console.log('Checking existing commands for device:', deviceId);
      const { data, error } = await supabase
        .from('device_controls')
        .select('id, user_id, command, processed')
        .eq('device_id', deviceId)
        .eq('processed', false)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error checking commands:', error);
        throw new Error(`Failed to check commands: ${error.message}`);
      }

      console.log('Existing commands:', data);
      if (data?.length > 0) {
        const activeCommand = data.find(cmd => cmd.command === 'start' && cmd.user_id !== user.id);
        if (activeCommand) {
          console.log('ESP32 busy with user:', activeCommand.user_id);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Unexpected error checking commands:', error);
      setAlert({ type: 'warning', message: 'Error checking device status.' });
      return false;
    }
  }, [user, deviceId]);

  const cleanupUserCommands = useCallback(async () => {
    if (!user) {
      console.log('cleanupUserCommands: No user authenticated.');
      return;
    }
    try {
      console.log('Cleaning up unprocessed commands for user:', user.id);
      const { error } = await supabase
        .from('device_controls')
        .delete()
        .eq('user_id', user.id)
        .eq('device_id', deviceId)
        .eq('processed', false);

      if (error) {
        console.error('Error cleaning up commands:', error);
        throw new Error(`Failed to clean up commands: ${error.message}`);
      }
      console.log('Unprocessed commands cleaned up successfully.');
    } catch (error) {
      console.error('cleanupUserCommands error:', error);
      setAlert({ type: 'warning', message: 'Error cleaning up previous commands.' });
    }
  }, [user, deviceId]);

  const startSensing = useCallback(async () => {
    if (commandDebounceRef.current) {
      clearTimeout(commandDebounceRef.current);
    }

    commandDebounceRef.current = setTimeout(async () => {
      console.log('startSensing triggered');
      if (!user) {
        console.log('startSensing: No user authenticated.');
        setAlert({ type: 'error', message: 'Please log in to start sensing.' });
        return;
      }
      if (isSensing) {
        console.log('startSensing: Already sensing, ignoring.');
        return;
      }

      const maxRetries = 3;
      let retryCount = 0;

      while (retryCount < maxRetries) {
        try {
          const isBusy = await checkExistingCommands();
          console.log('Device busy:', isBusy);
          if (isBusy) {
            setAlert({ type: 'warning', message: 'Device is busy with another user. Please try again later.' });
            return;
          }

          await cleanupUserCommands();

          console.log('Refreshing auth session...');
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !session?.access_token) {
            console.error('Session error:', sessionError);
            throw new Error('No valid auth token.');
          }
          console.log('Auth token retrieved:', session.access_token.substring(0, 10) + '...');

          const sessionId = uuidv4();
          setCurrentSessionId(sessionId);
          resetSensorData();

          const payload = {
            device_id: deviceId,
            command: 'start',
            user_id: user.id,
            session_id: sessionId,
            auth_token: session.access_token,
            processed: false,
            created_at: new Date().toISOString(),
          };
          console.log('Inserting start command:', payload);

          const { data, error } = await supabase
            .from('device_controls')
            .insert(payload)
            .select();

          if (error) {
            console.error('Supabase insert error:', {
              message: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint,
            });
            if (error.code === '429' && retryCount < maxRetries - 1) {
              console.log(`Rate limit hit, retrying after ${1000 * (retryCount + 1)}ms...`);
              await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
              retryCount++;
              continue;
            }
            throw new Error(`Failed to start sensing: ${error.message} (Code: ${error.code || 'N/A'})`);
          }

          console.log('Start command inserted:', data);
          setIsSensing(true);
          setSystemStatus('Scanning...');
          setAlert({ type: 'success', message: 'Sensing started.' });

          let timeLeft = 60;
          setTimer(`Time Left: ${timeLeft}s`);
          timerRef.current = setInterval(() => {
            timeLeft--;
            setTimer(`Time Left: ${timeLeft}s`);
            if (timeLeft <= 0) {
              stopSensing();
            }
          }, 1000);
          console.log('startSensing completed successfully');
          break;
        } catch (error) {
          console.error('startSensing error:', {
            message: error.message,
            stack: error.stack,
          });
          setAlert({ type: 'error', message: error.message });
          setIsSensing(false);
          setSystemStatus('Idle');
          if (retryCount < maxRetries - 1) {
            console.log(`Retrying startSensing (${retryCount + 1}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            retryCount++;
          } else {
            break;
          }
        }
      }
    }, 500);
  }, [user, isSensing, deviceId, checkExistingCommands, cleanupUserCommands, resetSensorData]);

  const stopSensing = useCallback(async () => {
    if (commandDebounceRef.current) {
      clearTimeout(commandDebounceRef.current);
    }

    commandDebounceRef.current = setTimeout(async () => {
      if (!user) {
        console.log('stopSensing: No user authenticated.');
        setAlert({ type: 'error', message: 'Please log in to stop sensing.' });
        return;
      }

      console.log('Stopping sensing...');
      setIsSensing(false);
      setSystemStatus('Idle');
      setTimer('');
      setCurrentSessionId(null);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      try {
        console.log('Refreshing auth session for stop...');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session?.access_token) {
          console.error('Session error in stopSensing:', sessionError);
          throw new Error('No valid auth token for stop.');
        }

        const payload = {
          device_id: deviceId,
          command: 'stop',
          user_id: user.id,
          session_id: uuidv4(),
          auth_token: session.access_token,
          processed: false,
          created_at: new Date().toISOString(),
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
        await cleanupUserCommands();
        setAlert({ type: 'success', message: 'Sensing stopped.' });
      } catch (error) {
        console.error('stopSensing error:', error);
        setAlert({ type: 'error', message: error.message });
        setIsSensing(true);
      }
    }, 500);
  }, [user, deviceId, cleanupUserCommands]);

  const saveUserStats = useCallback(async (stats) => {
    if (!user) return;
    try {
      const updates = {
        user_id: user.id,
        ...stats,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('user_stats')
        .upsert(updates, { onConflict: 'user_id' });
      if (error) throw error;
      setTotalBottleCount(updates.total_bottle_count);
      setTotalCanCount(updates.total_can_count);
      setTotalPoints(updates.total_points);
      setTotalMoney(updates.total_money.toFixed(2));
    } catch (error) {
      setAlert({ type: 'error', message: error.message });
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      setAlert({ type: 'error', message: 'Please log in to submit recyclables.' });
      return;
    }
    if (!hasNewData) {
      setAlert({ type: 'warning', message: 'No new recyclables detected in this session.' });
      return;
    }

    // Prepare records for all detected materials
    const records = [];
    if (bottleCount > 0) {
      records.push({
        user_id: user.id,
        material: 'PLASTIC_BOTTLE',
        quantity: bottleCount,
        confidence: 1, // <-- Add this line
        created_at: new Date().toISOString(),
        device_id: deviceId,
        session_id: currentSessionId,
      });
    }
    if (canCount > 0) {
      records.push({
        user_id: user.id,
        material: 'CAN',
        quantity: canCount,
        confidence: 1, // <-- Add this line
        created_at: new Date().toISOString(),
        device_id: deviceId,
        session_id: currentSessionId,
      });
    }

    if (records.length === 0) {
      setAlert({ type: 'warning', message: 'No bottles or cans detected.' });
      return;
    }

    // Insert all records
    try {
      const { error } = await supabase.from('recyclables').insert(records);
      if (error) throw error;
    } catch (error) {
      setAlert({ type: 'error', message: 'Failed to save recyclable: ' + error.message });
      return;
    }

    // After calculating points and money
    const { points, money } = await updateEarnings(bottleCount, canCount);

    // Save user stats using the new values directly
    await saveUserStats({
      total_bottle_count: totalBottleCount + bottleCount,
      total_can_count: totalCanCount + canCount,
      total_points: totalPoints + points,
      total_money: parseFloat(totalMoney) + parseFloat(money),
    });

    setAlert({ type: 'success', message: 'Recyclables recorded!' });
    resetSensorData();
    await stopSensing();
  };

  useEffect(() => {
    const initializeAuth = async () => {
      console.log('Initializing authentication...');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session || !session.user) {
        console.error('Authentication failed:', sessionError);
        setAlert({ type: 'error', message: 'Please log in to continue.' });
        setTimeout(() => window.location.href = '/login', 2000);
        return;
      }

      setUser(session.user);
      setUserData({ name: session.user.user_metadata?.name || 'Guest', points: 0 });
      console.log('User authenticated:', session.user.id);

      try {
        const { data, error } = await supabase
          .from('user_stats')
          .select('total_bottle_count, total_can_count, total_points, total_money')
          .eq('user_id', session.user.id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            const { error: insertError } = await supabase
              .from('user_stats')
              .insert({
                user_id: session.user.id,
                total_bottle_count: 0,
                total_can_count: 0,
                total_points: 0,
                total_money: 0,
              });
            if (insertError) {
              console.error('Error initializing user stats:', insertError);
              setAlert({ type: 'error', message: 'Failed to initialize user stats.' });
            }
          } else {
            console.error('Error fetching user stats:', error);
            setAlert({ type: 'error', message: `Failed to load user stats: ${error.message}` });
          }
          return;
        }

        setTotalBottleCount(data.total_bottle_count);
        setTotalCanCount(data.total_can_count);
        setTotalPoints(data.total_points);
        setTotalMoney(data.total_money.toFixed(2));
        console.log('User stats loaded:', data);
      } catch (error) {
        console.error('Unexpected error fetching user stats:', error);
        setAlert({ type: 'error', message: 'Unexpected error loading user stats.' });
      }
    };

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event);
      if (session?.user) {
        setUser(session.user);
        setUserData({ name: session.user.user_metadata?.name || 'Guest', points: 0 });
      } else {
        setUser(null);
        setAlert({ type: 'error', message: 'Session expired. Please log in.' });
        setTimeout(() => window.location.href = '/login', 2000);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !isSensing) {
      console.log("Polling skipped: user=" + (user ? user.id : "null") + ", isSensing=" + isSensing);
      return;
    }

    console.log("Starting recyclables polling...");
    const pollRecyclables = async () => {
      console.log("Polling recyclables for user: " + user.id);
      await fetchRecentRecyclables();
    };

    pollRecyclables();
    pollRef.current = setInterval(pollRecyclables, 2000);

    return () => {
      console.log("Stopping recyclables polling...");
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [user, isSensing, fetchRecentRecyclables]);

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
                <FontAwesomeIcon icon={faPlay} /> Scan Recyclables
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
                disabled={!user || !isSensing}
              >
                <FontAwesomeIcon icon={faSync} /> Refresh
              </button>
            </div>
            <button type="submit" className="control-btn submit-btn" disabled={!isSensing || !user || !hasNewData}>
              Add Recyclables
            </button>
            <div className="timer-display">{timer}</div>
          </form>

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
      </div>
    </Layout>
  );
};

export default Insert;