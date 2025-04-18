import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faStop, faList } from '@fortawesome/free-solid-svg-icons';
import { supabase } from '../config/supabase';
import '../styles/Insert.css';
import Layout from '../components/Layout';

const Insert = () => {
  const navigate = useNavigate();
  const [isSensing, setIsSensing] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [detections, setDetections] = useState([]);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          console.error('No session found:', sessionError);
          setError('Please log in to start sensing.');
          navigate('/login');
          return;
        }

        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        if (!storedUser.id || storedUser.id !== session.user.id) {
          console.error('Stored user ID mismatch:', storedUser.id, session.user.id);
          setError('Invalid user session.');
          navigate('/login');
          return;
        }

        setUser({ id: session.user.id, name: storedUser.name });
        console.log('Authenticated user:', { id: session.user.id, name: storedUser.name });

        // Fetch existing transactions for this user
        const { data: transactionData, error: transactionError } = await supabase
          .from('recyclable_transactions')
          .select('id, type, quantity, points, money, created_at')
          .eq('device_id', 'esp32-cam-1')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(10);

        if (transactionError) throw new Error(transactionError.message || 'Failed to fetch transactions');

        setDetections(transactionData || []);

        // Subscribe to new recyclable transactions
        const subscription = supabase
          .channel('recyclable_transactions_changes')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'recyclable_transactions',
              filter: `device_id=eq.esp32-cam-1&user_id=eq.${session.user.id}`,
            },
            (payload) => {
              console.log('New transaction:', payload);
              setDetections((prev) => [payload.new, ...prev.slice(0, 9)]);

              // Update user stats in localStorage
              updateUserStats(payload.new);
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(subscription);
        };
      } catch (error) {
        console.error('Session check error:', error);
        setError(
          error.message.includes('permission')
            ? 'Access denied. Please contact support.'
            : error.message || 'Failed to initialize'
        );
        navigate('/login');
      }
    };

    checkSession();
  }, [navigate]);

  const updateUserStats = async (transaction) => {
    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('points, bottles, cans')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      const updates = {};
      if (transaction.type === 'bottle') {
        updates.bottles = (userData.bottles || 0) + transaction.quantity;
      } else if (transaction.type === 'can') {
        updates.cans = (userData.cans || 0) + transaction.quantity;
      }
      updates.points = (userData.points || 0) + transaction.points;

      const { error: updateError } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Update localStorage
      const updatedUser = {
        ...JSON.parse(localStorage.getItem('user') || '{}'),
        points: updates.points,
        bottles: updates.bottles || userData.bottles,
        cans: updates.cans || userData.cans,
      };
      localStorage.setItem('user', JSON.stringify(updatedUser));
    } catch (error) {
      console.error('Error updating user stats:', error);
      setError('Failed to update user stats: ' + error.message);
    }
  };

  const startSensing = async () => {
    if (!user) {
      setError('Please log in to start sensing.');
      navigate('/login');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('Authentication required');
      }

      if (session.user.id !== user.id) {
        throw new Error('Session user ID mismatch');
      }

      console.log('Inserting start command for user:', user.id);

      const { data, error: insertError } = await supabase
        .from('device_controls')
        .insert({
          device_id: 'esp32-cam-1',
          command: 'start',
          user_id: user.id,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error('Insert error:', insertError);
        throw new Error(`Start failed: ${insertError.message}`);
      }

      console.log('Command inserted:', data);
      setIsSensing(true);
      setError('');
    } catch (error) {
      console.error('Start sensing error:', error);
      setError(
        error.message.includes('permission')
          ? 'Access denied. Please contact support.'
          : error.message || 'Failed to start sensing'
      );
    } finally {
      setLoading(false);
    }
  };

  const stopSensing = async () => {
    setLoading(true);
    setError('');

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('Authentication required');
      }

      const { data, error: insertError } = await supabase
        .from('device_controls')
        .insert({
          device_id: 'esp32-cam-1',
          command: 'stop',
          user_id: user.id,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) throw new Error(insertError.message || 'Failed to insert stop command');

      console.log('Stop command inserted:', data);
      setIsSensing(false);
      setError('');
    } catch (error) {
      console.error('Stop sensing error:', error);
      setError(
        error.message.includes('permission')
          ? 'Access denied. Please contact support.'
          : error.message || 'Failed to stop sensing'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Insert Material">
      <div className="insert-container">
        <div className="control-section">
          <h2>Control ESP32-CAM</h2>
          {error && <div className="error-message">{error}</div>}
          <div className="button-group">
            <button
              onClick={startSensing}
              disabled={isSensing || loading || !user}
              className="control-button start-button"
            >
              <FontAwesomeIcon icon={faPlay} /> {loading && !isSensing ? 'Starting...' : 'Start Sensing'}
            </button>
            <button
              onClick={stopSensing}
              disabled={!isSensing || loading}
              className="control-button stop-button"
            >
              <FontAwesomeIcon icon={faStop} /> {loading && isSensing ? 'Stopping...' : 'Stop Sensing'}
            </button>
          </div>
        </div>

        <div className="detections-section">
          <h2>
            <FontAwesomeIcon icon={faList} /> Recent Transactions
          </h2>
          {detections.length > 0 ? (
            <ul className="detections-list">
              {detections.map((transaction) => (
                <li key={transaction.id}>
                  {transaction.type} (Qty: {transaction.quantity}, Points: {transaction.points}, Money: ₱{transaction.money.toFixed(2)}) -{' '}
                  {new Date(transaction.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          ) : (
            <p>No transactions yet.</p>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Insert;