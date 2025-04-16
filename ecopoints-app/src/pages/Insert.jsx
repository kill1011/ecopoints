import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import './Insert.css';

const Insert = () => {
  const { user } = useAuth();
  const [isSensing, setIsSensing] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [liveCounts, setLiveCounts] = useState({ 'Plastic Bottle': 0, 'Can': 0 });
  const [pastSessions, setPastSessions] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch past sessions on component mount
  useEffect(() => {
    const fetchPastSessions = async () => {
      if (!user) return;
      console.log('[Insert.jsx] Fetching past sessions for user:', user.id);
      const { data, error } = await supabase
        .from('recycling_sessions')
        .select('id, user_id, bottle_count, can_count, points_earned, total_value, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Insert.jsx] Error fetching past sessions:', error);
        setError('Failed to load past sessions.');
      } else {
        console.log('[Insert.jsx] Past sessions fetched:', data);
        setPastSessions(data);
      }
    };

    fetchPastSessions();
  }, [user]);

  // Subscribe to session_detections for real-time updates
  useEffect(() => {
    if (!isSensing || !sessionId || !user) return;

    console.log('[Insert.jsx] Setting up subscription for session_id:', sessionId, 'user_id:', user.id);
    const subscription = supabase
      .channel('session_detections_channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_detections',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          console.log('[Insert.jsx] New detection received:', payload);
          if (payload.new.user_id !== user.id) {
            console.log('[Insert.jsx] User ID mismatch:', payload.new.user_id, '!=', user.id);
            return;
          }
          setLiveCounts((prev) => {
            const newCounts = { ...prev };
            const material = payload.new.material;
            newCounts[material] = (newCounts[material] || 0) + payload.new.quantity;
            console.log('[Insert.jsx] Updated live counts:', newCounts);
            return newCounts;
          });
        }
      )
      .subscribe((status) => {
        console.log('[Insert.jsx] Subscription status:', status);
      });

    return () => {
      console.log('[Insert.jsx] Unsubscribing from session_detections');
      supabase.removeChannel(subscription);
    };
  }, [isSensing, sessionId, user]);

  // Polling fallback for session_detections
  useEffect(() => {
    if (!isSensing || !sessionId || !user) return;

    const fetchDetections = async () => {
      console.log('[Insert.jsx] Polling session_detections for session_id:', sessionId, 'user_id:', user.id);
      const { data, error } = await supabase
        .from('session_detections')
        .select('material, quantity')
        .eq('session_id', sessionId)
        .eq('user_id', user.id);

      if (error) {
        console.error('[Insert.jsx] Polling error:', error);
      } else {
        console.log('[Insert.jsx] Fetched session detections:', data);
        const newCounts = { 'Plastic Bottle': 0, 'Can': 0 };
        data.forEach((detection) => {
          newCounts[detection.material] = (newCounts[detection.material] || 0) + detection.quantity;
        });
        setLiveCounts(newCounts);
        console.log('[Insert.jsx] Updated live counts via polling:', newCounts);
      }
    };

    fetchDetections();
    const interval = setInterval(fetchDetections, 5000);
    return () => clearInterval(interval);
  }, [isSensing, sessionId, user]);

  const startSensing = async () => {
    if (!user) {
      setError('User not authenticated.');
      return;
    }

    setIsLoading(true);
    try {
      // Create a new session
      const { data: sessionData, error: sessionError } = await supabase
        .from('recycling_sessions')
        .insert({ user_id: user.id })
        .select('id')
        .single();

      if (sessionError) throw sessionError;

      const newSessionId = sessionData.id;
      console.log('[Insert.jsx] New session created:', sessionData);
      setSessionId(newSessionId);

      // Update device_control to start sensing
      const { error: controlError } = await supabase
        .from('device_control')
        .upsert({
          device_id: 'esp32-cam-1',
          command: 'start',
          user_id: user.id,
          session_id: newSessionId,
          updated_at: new Date().toISOString(),
        });

      if (controlError) throw controlError;

      setIsSensing(true);
      setLiveCounts({ 'Plastic Bottle': 0, 'Can': 0 });
      console.log('[Insert.jsx] Start successful - isSensing:', true, 'session_id:', newSessionId);
    } catch (err) {
      console.error('[Insert.jsx] Start sensing error:', err);
      setError('Failed to start sensing: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const stopSensing = async (endSession = false) => {
    setIsLoading(true);
    try {
      // Update device_control to stop sensing
      const { error: controlError } = await supabase
        .from('device_control')
        .upsert({
          device_id: 'esp32-cam-1',
          command: 'stop',
          user_id: user.id,
          session_id: sessionId,
          updated_at: new Date().toISOString(),
        });

      if (controlError) throw controlError;

      if (endSession) {
        // Fetch session detections to aggregate
        const { data: detections, error: fetchError } = await supabase
          .from('session_detections')
          .select('material, quantity')
          .eq('session_id', sessionId)
          .eq('user_id', user.id);

        if (fetchError) throw fetchError;

        console.log('[Insert.jsx] Session detections at stop:', detections);
        const bottleCount = detections
          .filter((d) => d.material === 'Plastic Bottle')
          .reduce((sum, d) => sum + d.quantity, 0);
        const canCount = detections
          .filter((d) => d.material === 'Can')
          .reduce((sum, d) => sum + d.quantity, 0);

        console.log('[Insert.jsx] Aggregated counts - Bottles:', bottleCount, 'Cans:', canCount);

        // Fetch points and value per item from recyclables table
        const { data: recyclables, error: recyclablesError } = await supabase
          .from('recyclables')
          .select('material, points, value');

        if (recyclablesError) throw recyclablesError;

        const pointsMap = recyclables.reduce((map, item) => {
          map[item.material] = { points: item.points, value: item.value };
          return map;
        }, {});

        const totalPoints = (pointsMap['Plastic Bottle']?.points || 0) * bottleCount + (pointsMap['Can']?.points || 0) * canCount;
        const totalValue = (pointsMap['Plastic Bottle']?.value || 0) * bottleCount + (pointsMap['Can']?.value || 0) * canCount;

        // Update recycling_sessions
        const { error: updateError } = await supabase
          .from('recycling_sessions')
          .update({
            bottle_count: bottleCount,
            can_count: canCount,
            points_earned: totalPoints,
            total_value: totalValue,
          })
          .eq('id', sessionId)
          .eq('user_id', user.id);

        if (updateError) throw updateError;

        // Delete session detections
        const { error: deleteError } = await supabase
          .from('session_detections')
          .delete()
          .eq('session_id', sessionId)
          .eq('user_id', user.id);

        if (deleteError) throw deleteError;

        // Refresh past sessions
        const { data: updatedSessions, error: sessionsError } = await supabase
          .from('recycling_sessions')
          .select('id, user_id, bottle_count, can_count, points_earned, total_value, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (sessionsError) throw sessionsError;

        setPastSessions(updatedSessions);
      }

      setIsSensing(false);
      setSessionId(null);
      setLiveCounts({ 'Plastic Bottle': 0, 'Can': 0 });
      console.log('[Insert.jsx] Stop successful - isSensing:', false);
    } catch (err) {
      console.error('[Insert.jsx] Stop sensing error:', err);
      setError('Failed to stop sensing: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="insert-container">
      <h2>Insert Recyclables</h2>
      {error && <p className="error">{error}</p>}
      <div className="session-controls">
        {!isSensing ? (
          <button onClick={startSensing} disabled={isLoading}>
            {isLoading ? 'Starting...' : 'Start Sensing'}
          </button>
        ) : (
          <>
            <button onClick={() => stopSensing(false)} disabled={isLoading}>
              {isLoading ? 'Pausing...' : 'Pause Sensing'}
            </button>
            <button onClick={() => stopSensing(true)} disabled={isLoading}>
              {isLoading ? 'Ending...' : 'Done Inserting'}
            </button>
          </>
        )}
      </div>
      {isSensing && (
        <div className="live-counts">
          <h3>Current Session Detections</h3>
          <p>Plastic Bottle: {liveCounts['Plastic Bottle']}</p>
          <p>Can: {liveCounts['Can']}</p>
        </div>
      )}
      <div className="past-sessions">
        <h3>Past Sessions</h3>
        {pastSessions.length === 0 ? (
          <p>No past sessions found.</p>
        ) : (
          pastSessions.map((session) => (
            <p key={session.id}>
              Bottles: {session.bottle_count}, Cans: {session.can_count}, Points: {session.points_earned}, Value: ${session.total_value.toFixed(2)} -{' '}
              {new Date(session.created_at).toLocaleString()}
            </p>
          ))
        )}
      </div>
    </div>
  );
};

export default Insert;