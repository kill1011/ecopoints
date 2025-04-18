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
  const [user, setUser] = useState(null);
  const [detections, setDetections] = useState([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const fetchUserAndDetections = async () => {
      try {
        // Get authenticated user
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
        if (authError || !authUser) {
          throw new Error('Please log in to continue.');
        }

        // Fetch user profile
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('id, username, gmail, total_points')
          .eq('id', authUser.id)
          .single();

        if (profileError || !profile) {
          console.error('Profile error:', profileError);
          throw new Error('User profile not found.');
        }

        setUser(profile);

        // Fetch initial detections
        const { data: detectionData, error: detectionError } = await supabase
          .from('recyclables')
          .select('material, quantity, confidence, points, created_at')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(10);

        if (detectionError) {
          console.error('Fetch detections error:', detectionError);
          throw new Error('Failed to load detections.');
        }

        setDetections(detectionData || []);

        // Subscribe to new detections
        const subscription = supabase
          .channel('recyclables_changes')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'recyclables',
              filter: `user_id=eq.${profile.id}`,
            },
            (payload) => {
              console.log('New detection:', payload);
              setDetections((prev) => [payload.new, ...prev.slice(0, 9)]);
            }
          )
          .subscribe((status, err) => {
            if (err || status === 'CLOSED') {
              console.error('Subscription error:', err || status);
              setError('Failed to subscribe to detections.');
            }
          });

        return () => {
          supabase.removeChannel(subscription);
        };
      } catch (error) {
        console.error('Initialization error:', error);
        setError(error.message);
        navigate('/login');
      } finally {
        setFetching(false);
      }
    };

    fetchUserAndDetections();
  }, [navigate]);

  const startSensing = async () => {
    if (!user) {
      setError('No user logged in.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error: insertError } = await supabase
        .from('device_controls')
        .insert({ device_id: 'esp32-cam-1', command: 'start', user_id: user.id })
        .select()
        .single();

      if (insertError) {
        console.error('Insert error:', insertError);
        throw new Error(`Start failed: ${insertError.message}`);
      }

      console.log('Inserted start command:', data);
      setIsSensing(true);
    } catch (error) {
      console.error('Start error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const stopSensing = async () => {
    if (!user) {
      setError('No user logged in.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error: insertError } = await supabase
        .from('device_controls')
        .insert({ device_id: 'esp32-cam-1', command: 'stop', user_id: user.id })
        .select()
        .single();

      if (insertError) {
        console.error('Stop error:', insertError);
        throw new Error(`Stop failed: ${insertError.message}`);
      }

      console.log('Inserted stop command:', data);
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
        {user ? (
          <div className="user-section">
            <h2>Welcome, {user.username}</h2>
            <p>Gmail: {user.gmail}</p>
            <p>Total Points: {user.total_points}</p>
          </div>
        ) : (
          <p>Please log in to continue.</p>
        )}
        <div className="control-section">
          <h2>Control ESP32-CAM</h2>
          {error && <div className="error-message">{error}</div>}
          <div className="button-group">
            <button
              onClick={startSensing}
              disabled={isSensing || loading || !user}
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
        <div className="detections-section">
          <h2>
            <FontAwesomeIcon icon={faList} /> Recent Detections
          </h2>
          {fetching ? (
            <p>Loading detections...</p>
          ) : detections.length > 0 ? (
            <ul className="detections-list">
              {detections.map((detection) => (
                <li key={detection.created_at}>
                  {detection.material} (Qty: {detection.quantity}, Confidence: {(detection.confidence * 100).toFixed(2)}%, Points: {detection.points}) -{' '}
                  {new Date(detection.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          ) : (
            <p>No detections received. Start sensing or check ESP32-CAM Serial Monitor.</p>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Insert;