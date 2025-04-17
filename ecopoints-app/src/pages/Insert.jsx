import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop, faHistory, faList, faCheck, faBottleWater, faBeer, faSignal } from '@fortawesome/free-solid-svg-icons';
import { createClient } from '@supabase/supabase-js';
import '../styles/Insert.css';

// Supabase client setup
const supabaseUrl = "https://welxjeybnoeeusehuoat.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlbHhqZXlibm9lZXVzZWh1b2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQxMTgzNzIsImV4cCI6MjA1OTY5NDM3Mn0.TmkmlnAA1ZmGgwgiFLsKW_zB7APzjFvuo3H9_Om_GCs";
const supabase = createClient(supabaseUrl, supabaseKey);

// ESP32 API URL (replace with your ESP32's IP address)
const esp32ApiUrl = "http://<ESP32_IP_ADDRESS>";

const Insert = () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [userData] = useState({
    name: user.name || 'Guest',
    points: user.points || 0,
    id: user.id || null,
  });
  const [alert, setAlert] = useState({ type: '', message: '' });
  const [systemStatus, setSystemStatus] = useState('Idle');
  const [isSensing, setIsSensing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [liveCounts, setLiveCounts] = useState({ 'Plastic Bottle': 0, 'Can': 0 });
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [dbError, setDbError] = useState(false);
  const [lastDetection, setLastDetection] = useState(null);
  const [recentDetections, setRecentDetections] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');

  useEffect(() => {
    console.log('[Insert.jsx] userData.id:', userData.id);
    if (!userData.id) {
      setAlert({ type: 'error', message: 'Please log in to start sensing.' });
    }

    // Verify Supabase schema
    const refreshSchema = async () => {
      try {
        await Promise.all([
          supabase.from('recyclables').select('id').limit(1),
          supabase.from('recycling_sessions').select('id').limit(1),
          supabase.from('session_detections').select('id').limit(1),
        ]);
        console.log('[Insert.jsx] Schema verified');
      } catch (error) {
        console.error('[Insert.jsx] Schema error:', error);
        setDbError(true);
        setAlert({ type: 'error', message: 'Database schema error. Check console.' });
      }
    };
    refreshSchema();

    if (userData.id) {
      fetchSessions();
    }

    // Check ESP32 connection
    const checkEsp32 = async () => {
      try {
        const response = await fetch(`${esp32ApiUrl}/api/status`);
        if (response.ok) {
          setConnectionStatus('Connected');
        } else {
          throw new Error('ESP32 not reachable');
        }
      } catch (error) {
        console.error('[Insert.jsx] ESP32 connection error:', error);
        setConnectionStatus('Disconnected');
        setAlert({ type: 'warning', message: 'Cannot connect to ESP32. Check network or IP address.' });
      }
    };
    checkEsp32();

    // Polling for new detections when sensing
    let pollInterval;
    if (isSensing && currentSessionId && userData.id) {
      pollInterval = setInterval(async () => {
        try {
          const { data, error } = await supabase
            .from('session_detections')
            .select('material, quantity, created_at')
            .eq('session_id', currentSessionId)
            .eq('user_id', userData.id)
            .order('created_at', { ascending: false })
            .limit(1);
          if (error) throw error;
          if (data && data.length > 0) {
            const detection = data[0];
            handleNewDetection({
              material: detection.material,
              quantity: detection.quantity,
              session_id: currentSessionId,
              user_id: userData.id,
              timestamp: detection.created_at,
            });
          }
        } catch (error) {
          console.error('[Insert.jsx] Polling error:', error);
        }
      }, 5000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [userData.id, isSensing, currentSessionId]);

  const sendEsp32Command = async (command, payload = {}) => {
    if (!userData.id || (command === 'start-sensing' && !currentSessionId)) {
      const errorMessage = 'Cannot send command: Missing user ID or session ID';
      console.error('[Insert.jsx]', errorMessage);
      setAlert({ type: 'error', message: errorMessage });
      return false;
    }
    try {
      const url = command === 'start-sensing' ? `${esp32ApiUrl}/api/start-sensing` : `${esp32ApiUrl}/api/stop-sensing`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `HTTP error: ${response.status}`);
      }
      console.log('[Insert.jsx] Command sent successfully:', result);
      setAlert({ type: 'success', message: `Command ${command} sent successfully` });
      return true;
    } catch (error) {
      console.error('[Insert.jsx] Command error:', error);
      setAlert({ type: 'error', message: `Failed to send command: ${error.message}` });
      return false;
    }
  };

  const handleNewDetection = async (data) => {
    if (!isSensing) return;

    const { material, quantity, session_id } = data;
    console.log('[Insert.jsx] Received detection:', data);
    if (!['Plastic Bottle', 'Can'].includes(material)) {
      console.warn('[Insert.jsx] Invalid material:', material);
      return;
    }
    if (session_id !== currentSessionId) {
      console.warn('[Insert.jsx] Detection for wrong session:', { received: session_id, expected: currentSessionId });
      return;
    }

    setLiveCounts((prev) => ({
      ...prev,
      [material]: (prev[material] || 0) + quantity,
    }));
    setLastDetection({
      material,
      quantity,
      timestamp: new Date(data.timestamp).toLocaleTimeString(),
    });
    setRecentDetections((prev) => [
      { material, quantity, timestamp: new Date(data.timestamp).toLocaleTimeString() },
      ...prev.slice(0, 9),
    ]);
    setAlert({
      type: 'success',
      message: `Detected: ${material} (${quantity})`,
    });
    console.log('[Insert.jsx] Detection processed:', { material, quantity });
  };

  const fetchSessions = async () => {
    if (!userData.id) {
      setAlert({ type: 'error', message: 'Please log in.' });
      return;
    }
    try {
      const { data, error } = await supabase
        .from('recycling_sessions')
        .select('id, bottle_count, can_count, points_earned, money_val, created_at')
        .eq('user_id', userData.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      setSessions(data || []);
      console.log('[Insert.jsx] Sessions fetched:', data);
    } catch (error) {
      console.error('[Insert.jsx] Fetch sessions error:', error);
      setAlert({ type: 'error', message: `Fetch sessions failed: ${error.message}` });
    }
  };

  const startSensing = async () => {
    if (isSensing || isLoading || dbError || !userData.id) {
      setAlert({ type: 'error', message: userData.id ? 'Invalid state' : 'Please log in.' });
      return;
    }
    setIsLoading(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from('recycling_sessions')
        .insert([
          {
            user_id: userData.id,
            bottle_count: 0,
            can_count: 0,
            points_earned: 0,
            money_val: 0,
            created_at: new Date().toISOString(),
          },
        ])
        .select('id')
        .single();
      if (sessionError) throw sessionError;

      setCurrentSessionId(sessionData.id);
      const commandSent = await sendEsp32Command('start-sensing', {
        session_id: sessionData.id,
        user_id: userData.id,
      });
      if (!commandSent) throw new Error('Failed to send start-sensing command');

      setIsSensing(true);
      setSystemStatus('Scanning...');
      setLiveCounts({ 'Plastic Bottle': 0, 'Can': 0 });
      setRecentDetections([]);
      console.log('[Insert.jsx] Start successful, session_id:', sessionData.id);
    } catch (error) {
      console.error('[Insert.jsx] Start error:', error);
      setAlert({ type: 'error', message: `Start failed: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const stopSensing = async (shouldSave = false) => {
    if (!isSensing || isLoading || dbError || !userData.id || !currentSessionId) {
      console.log('[Insert.jsx] Stop skipped:', { isSensing, isLoading, dbError, userId: userData.id, sessionId: currentSessionId });
      return;
    }
    setIsLoading(true);
    try {
      const commandSent = await sendEsp32Command('stop-sensing');
      if (!commandSent) throw new Error('Failed to send stop-sensing command');

      const { data: sessionDetections, error: detectionError } = await supabase
        .from('session_detections')
        .select('material, quantity')
        .eq('session_id', currentSessionId)
        .eq('user_id', userData.id);
      if (detectionError) throw detectionError;

      let bottleCount = 0;
      let canCount = 0;
      sessionDetections.forEach((d) => {
        if (d.material === 'Plastic Bottle') bottleCount += d.quantity;
        else if (d.material === 'Can') canCount += d.quantity;
      });

      if (shouldSave) {
        const materialsToInsert = [];
        if (bottleCount > 0) {
          materialsToInsert.push({
            device_id: 'esp32-cam-1',
            user_id: userData.id,
            material: 'Plastic Bottle',
            quantity: bottleCount,
            created_at: new Date().toISOString(),
          });
        }
        if (canCount > 0) {
          materialsToInsert.push({
            device_id: 'esp32-cam-1',
            user_id: userData.id,
            material: 'Can',
            quantity: canCount,
            created_at: new Date().toISOString(),
          });
        }
        if (materialsToInsert.length > 0) {
          const { error: insertError } = await supabase.from('recyclables').insert(materialsToInsert);
          if (insertError) throw insertError;
        }

        const pointsPerItem = 10;
        const moneyPerItem = 0.05;
        const pointsEarned = (bottleCount + canCount) * pointsPerItem;
        const moneyVal = (bottleCount + canCount) * moneyPerItem;

        const { error: updateError } = await supabase
          .from('recycling_sessions')
          .update({
            bottle_count: bottleCount,
            can_count: canCount,
            points_earned: pointsEarned,
            money_val: moneyVal,
          })
          .eq('id', currentSessionId);
        if (updateError) throw updateError;

        const { error: userError } = await supabase
          .from('users')
          .update({ points: userData.points + pointsEarned })
          .eq('id', userData.id);
        if (userError) throw userError;

        setAlert({
          type: 'success',
          message: `Session ended. Earned ${pointsEarned} points ($${moneyVal.toFixed(2)}).`,
        });
      } else {
        setAlert({ type: 'info', message: 'Session stopped. Detections discarded.' });
      }

      const { error: clearError } = await supabase
        .from('session_detections')
        .delete()
        .eq('session_id', currentSessionId)
        .eq('user_id', userData.id);
      if (clearError) throw clearError;

      if (shouldSave) await fetchSessions();

      setIsSensing(false);
      setSystemStatus('Idle');
      setCurrentSessionId(null);
      setLiveCounts({ 'Plastic Bottle': 0, 'Can': 0 });
      setLastDetection(null);
      setRecentDetections([]);
    } catch (error) {
      console.error('[Insert.jsx] Stop error:', error);
      setAlert({ type: 'error', message: `Stop failed: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const stopSensingHandler = async () => await stopSensing(false);
  const doneInserting = async () => await stopSensing(true);

  const getMaterialIcon = (material) => {
    return material === 'Plastic Bottle' ? faBottleWater : material === 'Can' ? faBeer : faRecycle;
  };

  const getMaterialColor = (material) => {
    return material === 'Plastic Bottle' ? '#3498db' : material === 'Can' ? '#e74c3c' : '#2ecc71';
  };

  const getConnectionStatusColor = () => {
    return connectionStatus === 'Connected' ? '#2ecc71' : '#e74c3c';
  };

  return (
    <Layout title="Insert Recyclables">
      <div className="insert-container">
        <div className="insert-header">
          <h1>
            <FontAwesomeIcon icon={faRecycle} /> Insert Recyclables
          </h1>
        </div>

        {alert.message && (
          <div className={`alert alert-${alert.type}`}>
            {alert.message}
            <button onClick={() => setAlert({ type: '', message: '' })}>×</button>
          </div>
        )}

        {dbError && (
          <div className="setup-instructions">
            <h3>Database Setup Needed</h3>
            <p>Run this SQL in Supabase SQL Editor:</p>
            <pre>
{`-- Create tables
CREATE TABLE IF NOT EXISTS recyclables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT,
  user_id UUID REFERENCES auth.users(id),
  material TEXT,
  quantity INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recycling_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  bottle_count INTEGER DEFAULT 0,
  can_count INTEGER DEFAULT 0,
  points_earned INTEGER DEFAULT 0,
  money_val FLOAT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES recycling_sessions(id),
  user_id UUID REFERENCES auth.users(id),
  material TEXT,
  quantity INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE recyclables ENABLE ROW LEVEL SECURITY;
ALTER TABLE recycling_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_detections ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow users to manage recyclables" ON recyclables
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Allow users to manage sessions" ON recycling_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Allow users to manage detections" ON session_detections
  FOR ALL USING (auth.uid() = user_id);
`}
            </pre>
            <button className="control-btn start-btn" onClick={() => window.location.reload()}>
              Reload After Setup
            </button>
          </div>
        )}

        {!dbError && (
          <div className="insert-grid">
            <div className="status-card">
              <div className="stat-label">
                <FontAwesomeIcon icon={faRecycle} /> Sensor Status
              </div>
              <div className="stat-value">{systemStatus}</div>
            </div>

            <div className="status-card">
              <div className="stat-label">
                <FontAwesomeIcon icon={faSignal} /> ESP32 Connection
              </div>
              <div className="stat-value" style={{ color: getConnectionStatusColor() }}>
                {connectionStatus}
              </div>
            </div>

            <div className="control-card">
              <div className="button-group">
                <button
                  type="button"
                  className="control-btn start-btn"
                  onClick={startSensing}
                  disabled={isSensing || isLoading || dbError || !userData.id}
                >
                  {isLoading && <span className="loading-spinner"></span>}
                  <FontAwesomeIcon icon={faPlay} /> {isLoading ? 'Starting...' : 'Start Sensing'}
                </button>
                <button
                  type="button"
                  className="control-btn stop-btn"
                  onClick={stopSensingHandler}
                  disabled={!isSensing || isLoading || dbError}
                >
                  {isLoading && <span className="loading-spinner"></span>}
                  <FontAwesomeIcon icon={faStop} /> {isLoading ? 'Stopping...' : 'Stop Sensing'}
                </button>
                <button
                  type="button"
                  className="control-btn done-btn"
                  onClick={doneInserting}
                  disabled={!isSensing || isLoading || dbError}
                >
                  {isLoading && <span className="loading-spinner"></span>}
                  <FontAwesomeIcon icon={faCheck} /> {isLoading ? 'Finishing...' : 'Done Inserting'}
                </button>
              </div>
            </div>

            {isSensing && (
              <div className="material-summary-card">
                <div className="stat-label">
                  <FontAwesomeIcon icon={faRecycle} /> Detected Materials
                </div>
                <div className="materials-summary">
                  {Object.entries(liveCounts).map(([material, count]) => (
                    count > 0 && (
                      <div
                        key={material}
                        className="material-item"
                        style={{
                          backgroundColor: getMaterialColor(material),
                          padding: '15px',
                          borderRadius: '8px',
                          margin: '10px 0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          color: 'white',
                          fontWeight: 'bold',
                        }}
                      >
                        <div className="material-icon">
                          <FontAwesomeIcon icon={getMaterialIcon(material)} size="2x" />
                        </div>
                        <div className="material-info">
                          <div className="material-name">{material}</div>
                          <div className="material-count">Count: {count}</div>
                        </div>
                      </div>
                    )
                  ))}
                  {Object.values(liveCounts).every((count) => count === 0) && (
                    <div className="no-materials">
                      <p>No materials detected yet.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {lastDetection && isSensing && (
              <div
                className="last-detection-card"
                style={{
                  animation: 'fadeIn 0.5s',
                  border: `2px solid ${getMaterialColor(lastDetection.material)}`,
                  borderRadius: '8px',
                  padding: '15px',
                  margin: '10px 0',
                }}
              >
                <div className="stat-label">
                  <FontAwesomeIcon icon={faRecycle} pulse /> Latest Detection
                </div>
                <div className="last-detection-info" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FontAwesomeIcon
                    icon={getMaterialIcon(lastDetection.material)}
                    size="3x"
                    style={{ color: getMaterialColor(lastDetection.material) }}
                  />
                  <div>
                    <h3>{lastDetection.material}</h3>
                    <p>Detected at {lastDetection.timestamp}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="detections-card">
              <div className="stat-label">
                <FontAwesomeIcon icon={faHistory} /> Current Session Detections
              </div>
              {isSensing ? (
                <div className="detections-content">
                  <div className="detection-counts">
                    <h3>Summary</h3>
                    <ul className="detections-list">
                      {Object.entries(liveCounts).map(([material, count]) => (
                        count > 0 && (
                          <li key={material}>
                            {material}: {count}
                          </li>
                        )
                      ))}
                      {Object.values(liveCounts).every((count) => count === 0) && <p>Insert materials to see detections.</p>}
                    </ul>
                  </div>
                  {recentDetections.length > 0 && (
                    <div className="detection-timeline">
                      <h3>Recent Items</h3>
                      <ul className="timeline-list">
                        {recentDetections.map((detection, index) => (
                          <li key={index} className="timeline-item">
                            <span className="detection-time">{detection.timestamp}</span>
                            <span className="detection-material">{detection.material}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p>Click "Start Sensing" to begin.</p>
              )}
            </div>

            <div className="sessions-card">
              <div className="stat-label">
                <FontAwesomeIcon icon={faList} /> Past Sessions
              </div>
              {sessions.length > 0 ? (
                <ul className="sessions-list">
                  {sessions.map((session) => (
                    <li key={session.id}>
                      Bottles: {session.bottle_count}, Cans: {session.can_count}, Points: {session.points_earned}, Value: $
                      {session.money_val.toFixed(2)} - {new Date(session.created_at).toLocaleString()}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No past sessions.</p>
              )}
            </div>

            <div className="preview-card">
              <div className="stat-label">User: {userData.name}</div>
              <div className="stat-value">Points: {userData.points}</div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Insert;