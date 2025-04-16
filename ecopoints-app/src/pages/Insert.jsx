import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faPlay, faStop, faHistory, faList, faCheck, faBottleWater, faBeer } from '@fortawesome/free-solid-svg-icons';
import { createClient } from '@supabase/supabase-js';
import '../styles/Insert.css';

// Supabase client setup
const supabaseUrl = "https://welxjeybnoeeusehuoat.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlbHhqZXlibm9lZXVzZWh1b2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQxMTgzNzIsImV4cCI6MjA1OTY5NDM3Mn0.TmkmlnAA1ZmGgwgiFLsKW_zB7APzjFvuo3H9_Om_GCs";
const supabase = createClient(supabaseUrl, supabaseKey);

const Insert = () => {
  // State variables
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
  const [sessionInitiated, setSessionInitiated] = useState(false);
  const [lastDetection, setLastDetection] = useState(null);
  const [recentDetections, setRecentDetections] = useState([]);

  // Initial setup: Check schema, reset device status, and fetch past sessions
  useEffect(() => {
    console.log('[Insert.jsx] Mounting component');
    const refreshSchema = async () => {
      try {
        await Promise.all([
          supabase.from('device_control').select('id').limit(1),
          supabase.from('recyclables').select('id').limit(1),
          supabase.from('recycling_sessions').select('id').limit(1),
          supabase.from('session_detections').select('id').limit(1),
        ]);
        console.log('[Insert.jsx] Schema refreshed successfully');
      } catch (error) {
        console.error('[Insert.jsx] Schema refresh error:', error);
        setDbError(true);
        setAlert({
          type: 'error',
          message: 'Failed to refresh database schema. Check console for details.',
        });
      }
    };

    const resetDeviceStatus = async () => {
      try {
        const newCommand = {
          device_id: 'esp32-cam-1',
          command: 'stop',
          user_id: userData.id,
          session_id: null,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('device_control')
          .upsert([newCommand], { onConflict: 'device_id,user_id' });

        if (error) throw error;

        console.log('[Insert.jsx] Device status reset to stop');
        setIsSensing(false);
        setSystemStatus('Idle');
      } catch (error) {
        console.error('[Insert.jsx] Reset device status error:', error);
        setAlert({
          type: 'error',
          message: `Failed to reset device status: ${error.message}`,
        });
      }
    };

    refreshSchema();
    resetDeviceStatus();
    fetchSessions();

    // Subscribe to device_control changes
    const statusSubscription = supabase
      .channel('device_status_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'device_control' },
        handleStatusChange
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'device_control' },
        handleStatusChange
      )
      .subscribe((status) => {
        console.log('[Insert.jsx] device_control subscription status:', status);
      });

    return () => {
      console.log('[Insert.jsx] Unmounting component');
      supabase.removeChannel(statusSubscription);
    };
  }, []);

  // Real-time subscription to session_detections with polling fallback
  useEffect(() => {
    if (!currentSessionId || !isSensing) {
      console.log('[Insert.jsx] Skipping session_detections subscription: session_id or isSensing missing');
      setLiveCounts({ 'Plastic Bottle': 0, 'Can': 0 });
      setRecentDetections([]);
      return;
    }

    console.log('[Insert.jsx] Setting up session_detections subscription for session_id:', currentSessionId);

    const detectionSubscription = supabase
      .channel('session_detections_changes')
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'session_detections',
          filter: `session_id=eq.${currentSessionId}`
        },
        (payload) => {
          console.log('[Insert.jsx] New detection received:', payload);
          handleNewDetection(payload);
        }
      )
      .subscribe((status) => {
        console.log('[Insert.jsx] session_detections subscription status:', status);
        if (status === 'SUBSCRIBED') {
          setAlert({ type: 'info', message: 'Real-time detection enabled' });
        } else if (status === 'CLOSED') {
          setAlert({ type: 'warning', message: 'Real-time detection disconnected' });
        }
      });

    const fetchDetections = async () => {
      try {
        const { data, error } = await supabase
          .from('session_detections')
          .select('material, quantity, created_at')
          .eq('session_id', currentSessionId)
          .eq('user_id', userData.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        console.log('[Insert.jsx] Raw session_detections data:', data);

        const counts = { 'Plastic Bottle': 0, 'Can': 0 };
        data.forEach((detection) => {
          if (counts.hasOwnProperty(detection.material)) {
            counts[detection.material] += detection.quantity;
          }
        });
        setLiveCounts(counts);

        // Update recent detections
        const recentItems = data.slice(0, 10).map(item => ({
          material: item.material,
          quantity: item.quantity,
          timestamp: new Date(item.created_at).toLocaleTimeString()
        }));
        setRecentDetections(recentItems);

        console.log('[Insert.jsx] Fetched session detections:', counts);
      } catch (error) {
        console.error('[Insert.jsx] Fetch session detections error:', error);
        setAlert({
          type: 'error',
          message: `Failed to fetch detections: ${error.message}`,
        });
      }
    };

    fetchDetections();

    const pollingInterval = setInterval(() => {
      if (isSensing) {
        fetchDetections();
      }
    }, 5000);

    return () => {
      console.log('[Insert.jsx] Unsubscribing from session_detections');
      supabase.removeChannel(detectionSubscription);
      clearInterval(pollingInterval);
      setLiveCounts({ 'Plastic Bottle': 0, 'Can': 0 });
      setRecentDetections([]);
    };
  }, [currentSessionId, isSensing]);

  // Debug liveCounts updates
  useEffect(() => {
    console.log('[Insert.jsx] liveCounts updated:', liveCounts);
  }, [liveCounts]);

  // Fetch past recycling sessions
  const fetchSessions = async () => {
    if (!userData.id) {
      setAlert({ type: 'error', message: 'User ID not found. Please log in.' });
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

      console.log('[Insert.jsx] Sessions fetched:', data);
      setSessions(data || []);
    } catch (error) {
      console.error('[Insert.jsx] Fetch sessions error:', error);
      setAlert({
        type: 'error',
        message: `Fetch sessions error: ${error.message}`,
      });
    }
  };

  // Handle device_control table changes
  const handleStatusChange = (payload) => {
    console.log('[Insert.jsx] Status event:', payload);
    const { new: newRecord } = payload;
    if (newRecord.device_id === 'esp32-cam-1' && newRecord.user_id === userData.id) {
      const isActive = newRecord.command === 'start';
      setIsSensing((prev) => {
        if (prev && !isActive) {
          setSystemStatus('Idle');
          setAlert({ type: 'info', message: 'Sensor stopped externally' });
          setSessionInitiated(false);
          return false;
        } else if (!prev && isActive) {
          if (sessionInitiated) {
            setSystemStatus('Scanning...');
            setAlert({ type: 'info', message: 'Sensor started' });
            return true;
          } else {
            console.log('[Insert.jsx] Ignoring external start command - session not initiated by user');
            return prev;
          }
        }
        return prev;
      });
    }
  };

  // Handle new detections from session_detections
  const handleNewDetection = (payload) => {
    console.log('[Insert.jsx] Handling new detection:', payload);
    const { new: newDetection } = payload;

    if (newDetection.session_id !== currentSessionId) {
      console.log('[Insert.jsx] Session ID mismatch:', {
        receivedSessionId: newDetection.session_id,
        expectedSessionId: currentSessionId,
      });
      return;
    }

    if (newDetection.user_id !== userData.id) {
      console.log('[Insert.jsx] User ID mismatch, but proceeding:', {
        receivedUserId: newDetection.user_id,
        expectedUserId: userData.id,
      });
    }

    setLiveCounts((prev) => {
      const updatedCounts = { ...prev };
      if (updatedCounts.hasOwnProperty(newDetection.material)) {
        updatedCounts[newDetection.material] = (updatedCounts[newDetection.material] || 0) + newDetection.quantity;
        console.log('[Insert.jsx] Updated live counts:', updatedCounts);
        return updatedCounts;
      } else {
        console.log('[Insert.jsx] Material not recognized:', newDetection.material);
        return prev;
      }
    });

    // Update last detection
    setLastDetection({
      material: newDetection.material,
      quantity: newDetection.quantity,
      timestamp: new Date().toLocaleTimeString()
    });

    // Add to recent detections
    setRecentDetections(prev => [{
      material: newDetection.material,
      quantity: newDetection.quantity,
      timestamp: new Date().toLocaleTimeString()
    }, ...prev.slice(0, 9)]);

    setAlert({
      type: 'success',
      message: `Detected: ${newDetection.material} (${newDetection.quantity})`,
    });
  };

  // Start sensing session
  const startSensing = async () => {
    if (isSensing || isLoading || dbError || !userData.id) {
      if (!userData.id) {
        setAlert({ type: 'error', message: 'User ID not found. Please log in.' });
      }
      return;
    }
    setIsLoading(true);
    console.log('[Insert.jsx] Sending start command');

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

      console.log('[Insert.jsx] New session created:', sessionData);
      setCurrentSessionId(sessionData.id);

      const newCommand = {
        device_id: 'esp32-cam-1',
        command: 'start',
        user_id: userData.id,
        session_id: sessionData.id,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('device_control')
        .upsert([newCommand], { onConflict: 'device_id,user_id' });

      if (error) throw error;

      setIsSensing(true);
      setSystemStatus('Scanning...');
      setSessionInitiated(true);
      setAlert({ type: 'success', message: 'Sensor started' });
      setLiveCounts({ 'Plastic Bottle': 0, 'Can': 0 });
      setRecentDetections([]);
      console.log('[Insert.jsx] Start successful - isSensing:', true, 'session_id:', sessionData.id);
    } catch (error) {
      console.error('[Insert.jsx] Start error:', error);
      setAlert({
        type: 'error',
        message: `Start failed: ${error.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Stop sensing session
  const stopSensing = async (shouldSave = false) => {
    if (!isSensing || isLoading || dbError || !userData.id || !currentSessionId) {
      console.log('[Insert.jsx] Stop skipped - invalid state:', { isSensing, isLoading, dbError, userId: userData.id, sessionId: currentSessionId });
      return;
    }
    setIsLoading(true);
    console.log('[Insert.jsx] Sending stop command, shouldSave:', shouldSave);

    try {
      const newCommand = {
        device_id: 'esp32-cam-1',
        command: 'stop',
        user_id: userData.id,
        session_id: currentSessionId,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('device_control')
        .upsert([newCommand], { onConflict: 'device_id,user_id' });

      if (error) throw error;

      const { data: sessionDetections, error: detectionError } = await supabase
        .from('session_detections')
        .select('material, quantity')
        .eq('session_id', currentSessionId)
        .eq('user_id', userData.id);

      if (detectionError) throw detectionError;

      console.log('[Insert.jsx] Session detections at stop:', sessionDetections);

      let bottleCount = 0;
      let canCount = 0;
      sessionDetections.forEach((detection) => {
        if (detection.material === 'Plastic Bottle') {
          bottleCount += detection.quantity;
        } else if (detection.material === 'Can') {
          canCount += detection.quantity;
        }
      });

      console.log('[Insert.jsx] Aggregated counts - Bottles:', bottleCount, 'Cans:', canCount);

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
          const { error: insertError } = await supabase
            .from('recyclables')
            .insert(materialsToInsert);

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
        setAlert({
          type: 'info',
          message: 'Session stopped. Detections discarded.',
        });
      }

      const { error: clearError } = await supabase
        .from('session_detections')
        .delete()
        .eq('session_id', currentSessionId)
        .eq('user_id', userData.id);

      if (clearError) throw clearError;

      if (shouldSave) {
        await fetchSessions();
      }

      setIsSensing(false);
      setSystemStatus('Idle');
      setCurrentSessionId(null);
      setLiveCounts({ 'Plastic Bottle': 0, 'Can': 0 });
      setLastDetection(null);
      setRecentDetections([]);
      setSessionInitiated(false);
    } catch (error) {
      console.error('[Insert.jsx] Stop error:', error);
      setAlert({
        type: 'error',
        message: `Stop failed: ${error.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Stop Sensing button handler (discard detections)
  const stopSensingHandler = async () => {
    await stopSensing(false);
  };

  // Done Inserting button handler (save detections)
  const doneInserting = async () => {
    await stopSensing(true);
  };

  // Get icon for material type
  const getMaterialIcon = (material) => {
    switch(material) {
      case 'Plastic Bottle':
        return faBottleWater;
      case 'Can':
        return faBeer;
      default:
        return faRecycle;
    }
  };

  // Get color for material type
  const getMaterialColor = (material) => {
    switch(material) {
      case 'Plastic Bottle':
        return '#3498db'; // Blue
      case 'Can':
        return '#e74c3c'; // Red
      default:
        return '#2ecc71'; // Green
    }
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
            <p>Run this SQL in Supabase SQL Editor to fix the schema:</p>
            <pre>
{`-- Add user_id and session_id to device_control
ALTER TABLE public.device_control
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS session_id UUID;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS device_control_user_id_idx ON public.device_control (user_id);

-- Add id column as primary key
ALTER TABLE public.device_control
ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT gen_random_uuid();

-- Drop existing primary key constraint on device_id (if it exists)
ALTER TABLE public.device_control
DROP CONSTRAINT IF EXISTS device_control_pkey;

-- Drop the existing unique constraint if it exists to avoid conflicts
ALTER TABLE public.device_control
DROP CONSTRAINT IF EXISTS device_control_device_id_user_id_unique;

-- Add unique constraint on (device_id, user_id)
ALTER TABLE public.device_control
ADD CONSTRAINT device_control_device_id_user_id_unique UNIQUE (device_id, user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.device_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recyclables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recycling_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_detections ENABLE ROW LEVEL SECURITY;

-- Update RLS policies
DROP POLICY IF EXISTS "Allow all operations on device_control" ON public.device_control;
DROP POLICY IF EXISTS "Allow users to manage their device control" ON public.device_control;
CREATE POLICY "Allow users to manage their device control"
  ON public.device_control FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow all operations on recyclables" ON public.recyclables;
DROP POLICY IF EXISTS "Allow users to manage their recyclables" ON public.recyclables;
CREATE POLICY "Allow users to manage their recyclables"
  ON public.recyclables FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow all operations on recycling_sessions" ON public.recycling_sessions;
DROP POLICY IF EXISTS "Allow users to manage their recycling sessions" ON public.recycling_sessions;
CREATE POLICY "Allow users to manage their recycling sessions"
  ON public.recycling_sessions FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow all operations on session_detections" ON public.session_detections;
DROP POLICY IF EXISTS "Allow users to manage their session detections" ON public.session_detections;
CREATE POLICY "Allow users to manage their session detections"
  ON public.session_detections FOR ALL
  USING (auth.uid() = user_id);
`}
            </pre>
            <button
              className="control-btn start-btn"
              onClick={() => window.location.reload()}
            >
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
              <div className="stat-value">
                {systemStatus}
              </div>
            </div>

            <div className="control-card">
              <div className="button-group">
                <button
                  type="button"
                  className="control-btn start-btn"
                  onClick={startSensing}
                  disabled={isSensing || isLoading || dbError}
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

            {/* Material Detection Summary Card */}
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
                          fontWeight: 'bold'
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
                  {Object.values(liveCounts).every(count => count === 0) && (
                    <div className="no-materials">
                      <p>No materials detected yet. Insert recyclables to see them here.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Latest Detection Indicator */}
            {lastDetection && isSensing && (
              <div className="last-detection-card" style={{ 
                animation: 'fadeIn 0.5s',
                border: `2px solid ${getMaterialColor(lastDetection.material)}`,
                borderRadius: '8px',
                padding: '15px',
                margin: '10px 0'
              }}>
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
                      {Object.values(liveCounts).every(count => count === 0) && (
                        <p>Insert materials to see detections.</p>
                      )}
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
                      Bottles: {session.bottle_count}, Cans: {session.can_count}, Points: {session.points_earned}, Value: ${session.money_val.toFixed(2)} -{' '}
                      {new Date(session.created_at).toLocaleString()}
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