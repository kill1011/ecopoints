import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faStop } from '@fortawesome/free-solid-svg-icons';
import { supabase } from '../config/supabase';
import '../styles/Insert.css';
import Layout from '../components/Layout';

const Insert = () => {
  const navigate = useNavigate();
  const [isSensing, setIsSensing] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        await supabase.auth.refreshSession();
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session || !session.user) {
          console.error('Session error:', sessionError);
          throw new Error('Please log in.');
        }

        console.log('Session:', {
          user_id: session.user.id,
          email: session.user.email,
          auth_uid: await supabase.auth.getUser().then(({ data }) => data.user?.id),
        });

        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        if (!storedUser.id || storedUser.id !== session.user.id) {
          console.error('User mismatch:', {
            stored_id: storedUser.id,
            session_id: session.user.id,
          });
          throw new Error('Invalid session.');
        }

        setUserId(session.user.id);
      } catch (error) {
        console.error('Session check:', error);
        setError(error.message);
        navigate('/login');
      }
    };

    checkSession();
  }, [navigate]);

  const startSensing = async () => {
    if (!userId) {
      setError('No user logged in.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await supabase.auth.refreshSession();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session || !session.user) {
        throw new Error('Authentication failed');
      }

      console.log('Insert attempt:', {
        user_id: userId,
        auth_uid: session.user.id,
        payload: { device_id: 'esp32-cam-1', command: 'start', user_id: userId },
      });

      const { data, error: insertError } = await supabase
        .from('device_controls')
        .insert({ device_id: 'esp32-cam-1', command: 'start', user_id: userId })
        .select()
        .single();

      if (insertError) {
        console.error('Insert error:', {
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          code: insertError.code,
        });
        throw new Error(`Start failed: ${insertError.message}`);
      }

      console.log('Inserted:', data);
      setIsSensing(true);
    } catch (error) {
      console.error('Start error:', error);
      setError(error.message || 'Failed to start sensing.');
    } finally {
      setLoading(false);
    }
  };

  const stopSensing = async () => {
    setLoading(true);
    setError('');

    try {
      const { data, error: insertError } = await supabase
        .from('device_controls')
        .insert({ device_id: 'esp32-cam-1', command: 'stop', user_id: userId })
        .select()
        .single();

      if (insertError) {
        console.error('Stop error:', insertError);
        throw new Error(`Stop failed: ${insertError.message}`);
      }

      console.log('Stopped:', data);
      setIsSensing(false);
    } catch (error) {
      console.error('Stop error:', error);
      setError(error.message);
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
              disabled={isSensing || loading || !userId}
              className="control-button start-button"
            >
              <FontAwesomeIcon icon={faPlay} /> {loading ? 'Starting...' : 'Start Sensing'}
            </button>
            <button
              onClick={stopSensing}
              disabled={!isSensing || loading}
              className="control-button stop-button"
            >
              <FontAwesomeIcon icon={faStop} /> {loading ? 'Stopping...' : 'Stop Sensing'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Insert;