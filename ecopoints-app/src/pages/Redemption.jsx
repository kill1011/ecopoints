import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExchangeAlt, faHistory } from '@fortawesome/free-solid-svg-icons';
import { supabase } from '../config/supabase';
import '../styles/Redemption.css';

const Redemption = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [redeemPoints, setRedeemPoints] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(false);
  const [redemptions, setRedemptions] = useState([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const checkAuthAndFetchData = async () => {
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

        // Fetch redemption history
        const { data: redemptions, error: redemptionError } = await supabase
          .from('redemption_requests')
          .select('id, points, status, created_at')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false });

        if (redemptionError) {
          console.error('Fetch redemptions error:', redemptionError);
          throw new Error('Failed to load redemption history.');
        }

        setRedemptions(redemptions || []);

        // Subscribe to user points updates
        const userSubscription = supabase
          .channel('user_points_changes')
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'users',
              filter: `id=eq.${profile.id}`,
            },
            (payload) => {
              console.log('User points update:', payload);
              setUser((prev) => ({ ...prev, total_points: payload.new.total_points || 0 }));
            }
          )
          .subscribe((status, err) => {
            if (err || status === 'CLOSED') {
              console.error('User subscription error:', err || status);
              setMessage('Failed to subscribe to points updates.');
              setMessageType('error');
            }
          });

        // Subscribe to redemption updates
        const redemptionSubscription = supabase
          .channel('redemption_requests_changes')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'redemption_requests',
              filter: `user_id=eq.${profile.id}`,
            },
            (payload) => {
              console.log('Redemption update:', payload);
              if (payload.eventType === 'INSERT') {
                setRedemptions((prev) => [payload.new, ...prev]);
              } else if (payload.eventType === 'UPDATE') {
                setRedemptions((prev) =>
                  prev.map((r) => (r.id === payload.new.id ? payload.new : r))
                );
              }
            }
          )
          .subscribe((status, err) => {
            if (err || status === 'CLOSED') {
              console.error('Redemption subscription error:', err || status);
              setMessage('Failed to subscribe to redemption updates.');
              setMessageType('error');
            }
          });

        return () => {
          supabase.removeChannel(userSubscription);
          supabase.removeChannel(redemptionSubscription);
        };
      } catch (error) {
        console.error('Auth check failed:', error);
        setMessage(error.message);
        setMessageType('error');
        navigate('/login');
      } finally {
        setFetching(false);
      }
    };

    checkAuthAndFetchData();
  }, [navigate]);

  const handleRedeem = async (e) => {
    e.preventDefault();
    if (!user) {
      setMessage('Please log in to redeem points.');
      setMessageType('error');
      return;
    }

    const points = parseInt(redeemPoints);
    if (!points || points <= 0) {
      setMessage('Please enter a valid number of points.');
      setMessageType('error');
      return;
    }

    if (points > user.total_points) {
      setMessage(`Insufficient points. You have ${user.total_points} points.`);
      setMessageType('error');
      return;
    }

    if (!window.confirm(`Redeem ${points} points?`)) {
      return;
    }

    setLoading(true);
    setMessage('');
    setMessageType('');

    try {
      const { data: redemption, error: redemptionError } = await supabase
        .from('redemption_requests')
        .insert({
          user_id: user.id,
          points,
          status: 'pending',
        })
        .select()
        .single();

      if (redemptionError) {
        console.error('Redemption error:', redemptionError);
        throw new Error(`Failed to submit redemption: ${redemptionError.message}`);
      }

      console.log('Redemption submitted:', redemption);
      setMessage('Redemption request sent! Waiting for admin approval.');
      setMessageType('success');
      setRedeemPoints('');
    } catch (error) {
      console.error('Redemption error:', error);
      setMessage(error.message || 'Failed to submit redemption request.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Points Redemption">
      <div className="redemption-grid">
        {user ? (
          <div className="stats-card">
            <h3>User Profile</h3>
            <p>Username: {user.username}</p>
            <p>Gmail: {user.gmail}</p>
            <h3>Available Points</h3>
            <div className="points-value">{user.total_points.toLocaleString()}</div>
          </div>
        ) : (
          <div className="stats-card">
            <p>Please log in to view your points.</p>
          </div>
        )}

        <div className="redemption-form-card">
          <h3>
            <FontAwesomeIcon icon={faExchangeAlt} /> Redeem Points
          </h3>
          <form onSubmit={handleRedeem}>
            <div className="form-group">
              <label htmlFor="points">Points to Redeem:</label>
              <input
                type="number"
                id="points"
                value={redeemPoints}
                onChange={(e) => setRedeemPoints(e.target.value)}
                min="1"
                required
                placeholder="Enter points (e.g., 50)"
                disabled={loading || !user}
              />
            </div>
            <button
              type="submit"
              className="redeem-button"
              disabled={loading || !redeemPoints || parseInt(redeemPoints) <= 0 || parseInt(redeemPoints) > (user?.total_points || 0)}
            >
              {loading ? 'Processing...' : 'Redeem Points'}
            </button>
          </form>
          {message && (
            <div className={`message ${messageType}`}>
              {message}
            </div>
          )}
        </div>

        <div className="redemption-history-card">
          <h3>
            <FontAwesomeIcon icon={faHistory} /> Redemption History
          </h3>
          {fetching ? (
            <p>Loading redemption history...</p>
          ) : redemptions.length > 0 ? (
            <div className="redemption-list">
              {redemptions.map((redemption) => (
                <div key={redemption.id} className="redemption-item">
                  <span>Points: {redemption.points}</span>
                  <span>
                    Status: <span className={`status ${redemption.status.toLowerCase()}`}>{redemption.status}</span>
                  </span>
                  <span>Requested: {new Date(redemption.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p>No redemption requests yet.</p>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Redemption;