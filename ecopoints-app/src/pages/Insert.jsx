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
        if (sessionError) {
          console.error('Session error:', sessionError);
          throw new Error('Session error: ' + sessionError.message);
        }
        if (!session || !session.user) {
          console.error('No active session');
          throw new Error('Please log in to start sensing.');
        }

        console.log('Session details:', {
          user_id: session.user.id,
          email: session.user.email,
          metadata: session.user.user_metadata,
          auth_uid: await supabase.auth.getUser().then(({ data }) => data.user?.id),
        });

        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        if (!storedUser.id || storedUser.id !== session.user.id) {
          console.error('Stored user mismatch:', {
            stored_id: storedUser.id,
            session_id: session.user.id,
          });
          throw new Error('Invalid user session.');
        }

        setUser({ id: session.user.id, name: storedUser.name || session.user.email });
        console.log('User set:', { id: session.user.id, name: storedUser.name });

        // Fetch detections
        const { data: detectionData, error: detectionError } = await supabase
          .from('recyclables')
          .select('material, quantity, confidence, created_at')
          .eq('device_id', 'esp32-cam-1')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(10);

        if (detectionError) {
          console.error('Detection fetch error:', detectionError);
          throw detectionError;
        }

        setDetections(detectionData || []);

        // Subscribe to detections
        const subscription = supabase
          .channel('recyclables_changes')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'recyclables',
              filter: `device_id=eq.esp32-cam-1&user_id=eq.${session.user.id}`,
            },
            (payload) => {
              console.log('New detection:', payload);
              setDetections((prev) => [payload.new, ...prev.slice(0, 9)]);
            }
          )
          .subscribe();

        return () => {
          console.log('Removing subscription');
          supabase.removeChannel(subscription);
        };
      } catch (error) {
        console.error('Session check failed:', error);
        setError(error.message || 'Failed to initialize.');
        navigate('/login');
      }
    };

    checkSession();
  }, [navigate]);

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
      if (sessionError || !session || !session.user) {
        console.error('Session error on start:', sessionError);
        throw new Error('Authentication required');
      }

      if (session.user.id !== user.id) {
        console.error('User ID mismatch:', {
          session_id: session.user.id,
          user_id: user.id,
        });
        throw new Error('Session user ID mismatch');
      }

      // Log auth context
      const authUser = await supabase.auth.getUser();
      console.log('Auth context:', {
        auth_uid: authUser.data.user?.id,
        insert_user_id: user.id,
        is_authenticated: !!authUser.data.user,
      });

      // Minimal insert payload
      const payload = {
        device_id: 'esp32-cam-1',
        command: 'start',
        user_id: user.id,
      };
      console.log('Insert payload:', payload);

      const { data, error: insertError } = await supabase
        .from('device_controls')
        .insert(payload)
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

      console.log('Command inserted:', data);
      setIsSensing(true);
      setError('');

      // Verify insert
      const { data: verifyData, error: verifyError } = await supabase
        .from('device_controls')
        .select('*')
        .eq('user_id', user.id)
        .eq('command', 'start')
        .order('created_at', { ascending: false })
        .limit(1);

      if (verifyError) {
        console.error('Verify error:', verifyError);
      } else {
        console.log('Verified inserted row:', verifyData);
      }
    } catch (error) {
      console.error('Start sensing error:', error);
      setError(error.message || 'Failed to start sensing. Please check your session and try again.');
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

      const payload = {
        device_id: 'esp32-cam-1',
        command: 'stop',
        user_id: user.id,
      };
      console.log('Stop payload:', payload);

      const { data, error: insertError } = await supabase
        .from('device_controls')
        .insert(payload)
        .select()
        .single();

      if (insertError) {
        console.error('Stop insert error:', insertError);
        throw new Error(`Stop failed: ${insertError.message}`);
      }

      console.log('Stop command inserted:', data);
      setIsSensing(false);
      setError('');
    } catch (error) {
      console.error('Stop sensing error:', error);
      setError(error.message || 'Failed to stop sensing.');
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
            <FontAwesomeIcon icon={faList} /> Recent Detections
          </h2>
          {detections.length > 0 ? (
            <ul className="detections-list">
              {detections.map((detection) => (
                <li key={detection.created_at}>
                  {detection.material} (Qty: {detection.quantity}, Confidence: {(detection.confidence * 100).toFixed(2)}%) -{' '}
                  {new Date(detection.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          ) : (
            <p>No detections yet.</p>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Insert;