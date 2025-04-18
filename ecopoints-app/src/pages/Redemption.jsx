import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExchangeAlt, faHistory, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { supabase } from '../config/supabase';
import '../styles/Redemption.css';

const Redemption = () => {
  const navigate = useNavigate();
  const [userPoints, setUserPoints] = useState(0);
  const [redeemAmount, setRedeemAmount] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(false);
  const [redemptions, setRedemptions] = useState([]);
  const [pointsNeeded, setPointsNeeded] = useState(0);

  useEffect(() => {
    const checkAuthAndFetchData = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          console.log('No session, redirecting to login');
          navigate('/login');
          return;
        }

        const userId = session.user.id;
        await Promise.all([
          fetchUserData(userId),
          fetchRedemptions(userId),
        ]);

        // Subscribe to real-time updates
        const userSubscription = supabase
          .channel('user_points_changes')
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'users',
              filter: `id=eq.${userId}`,
            },
            (payload) => {
              console.log('User points update:', payload);
              setUserPoints(payload.new.points || 0);
            }
          )
          .subscribe((status) => {
            console.log('User subscription status:', status);
          });

        const redemptionSubscription = supabase
          .channel('redemption_requests_changes')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'redemption_requests',
              filter: `user_id=eq.${userId}`,
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
          .subscribe((status) => {
            console.log('Redemption subscription status:', status);
          });

        return () => {
          supabase.removeChannel(userSubscription);
          supabase.removeChannel(redemptionSubscription);
        };
      } catch (error) {
        console.error('Auth check failed:', error);
        navigate('/login');
      }
    };

    checkAuthAndFetchData();
  }, [navigate]);

  const fetchUserData = async (userId) => {
    try {
      const { data: userData, error } = await supabase
        .from('users')
        .select('points')
        .eq('id', userId)
        .single();

      if (error) throw error;
      if (!userData) throw new Error('User data not found');

      setUserPoints(userData.points || 0);
      setMessage('');
      setMessageType('');
    } catch (error) {
      console.error('Error fetching user data:', error);
      setUserPoints(0);
      setMessage('Error loading user data. Please try again.');
      setMessageType('error');
    }
  };

  const fetchRedemptions = async (userId) => {
    try {
      const { data: redemptions, error } = await supabase
        .from('redemption_requests')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setRedemptions(redemptions || []);
    } catch (error) {
      console.error('Error fetching redemptions:', error);
      setMessage('Error loading redemption history.');
      setMessageType('error');
    }
  };

  const calculatePointsNeeded = (amount) => {
    return Math.ceil(amount * 100); // 1 peso = 100 points
  };

  const handleAmountChange = (e) => {
    const amount = e.target.value;
    setRedeemAmount(amount);
    const parsedAmount = parseFloat(amount);
    if (!isNaN(parsedAmount) && parsedAmount > 0) {
      setPointsNeeded(calculatePointsNeeded(parsedAmount));
    } else {
      setPointsNeeded(0);
    }
  };

  const handleRedeem = async (e) => {
    e.preventDefault();
    if (!window.confirm(`Redeem ₱${parseFloat(redeemAmount).toFixed(2)} for ${pointsNeeded} points?`)) {
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Authentication required');

      const amount = parseFloat(redeemAmount);
      if (isNaN(amount) || amount <= 0) {
        setMessage('Please enter a valid amount');
        setMessageType('error');
        return;
      }

      const pointsNeeded = calculatePointsNeeded(amount);
      if (pointsNeeded > userPoints) {
        setMessage(`Insufficient points. You need ${pointsNeeded} points to redeem ₱${amount.toFixed(2)}`);
        setMessageType('error');
        return;
      }

      // Start transaction
      const { data: currentUser, error: userError } = await supabase
        .from('users')
        .select('points')
        .eq('id', session.user.id)
        .single();

      if (userError) throw userError;

      if (pointsNeeded > currentUser.points) {
        setMessage(`Insufficient points. You need ${pointsNeeded} points to redeem ₱${amount.toFixed(2)}`);
        setMessageType('error');
        return;
      }

      const newPoints = currentUser.points - pointsNeeded;

      const { error: updateError } = await supabase
        .from('users')
        .update({ points: newPoints })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

      const { data: redemption, error: redemptionError } = await supabase
        .from('redemption_requests')
        .insert({
          user_id: session.user.id,
          amount: amount,
          points: pointsNeeded,
          status: 'pending',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (redemptionError) throw redemptionError;

      await supabase
        .from('admin_notifications')
        .insert({
          type: 'redemption_request',
          user_id: session.user.id,
          user_name: session.user.user_metadata?.name || session.user.email,
          message: `New redemption request: ₱${amount.toFixed(2)} (${pointsNeeded} points)`,
          request_id: redemption.id,
          status: 'unread',
          created_at: new Date().toISOString(),
        });

      setMessage('Redemption request sent! Waiting for admin approval.');
      setMessageType('success');
      setRedeemAmount('');
      setPointsNeeded(0);
    } catch (error) {
      console.error('Redemption Error:', error);
      setMessage(error.message || 'Failed to submit redemption request');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Balance Redemption">
      <div className="redemption-grid">
        <div className="stats-card">
          <h3>Available Points</h3>
          <div className="points-value">{userPoints.toLocaleString()}</div>
          <h3>Available Balance</h3>
          <div className="money-value">₱{(userPoints / 100).toFixed(2)}</div>
          <small className="conversion-note">
            <FontAwesomeIcon icon={faInfoCircle} /> 100 points = ₱1
          </small>
        </div>

        <div className="redemption-form-card">
          <h3>Redeem Balance</h3>
          <form onSubmit={handleRedeem}>
            <div className="form-group">
              <label htmlFor="amount">Amount to Redeem (₱):</label>
              <input
                type="number"
                id="amount"
                value={redeemAmount}
                onChange={handleAmountChange}
                step="0.01"
                min="0.01"
                required
                placeholder="Enter amount (e.g., 5.00)"
                disabled={loading}
              />
              {pointsNeeded > 0 && (
                <small className="points-needed">
                  Requires {pointsNeeded} points
                  {pointsNeeded > userPoints && (
                    <span className="insufficient"> (Insufficient points)</span>
                  )}
                </small>
              )}
            </div>
            <button
              type="submit"
              className="redeem-button"
              disabled={loading || !redeemAmount || parseFloat(redeemAmount) <= 0 || pointsNeeded > userPoints}
            >
              {loading ? 'Processing...' : 'Redeem Balance'}
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
          {redemptions.length > 0 ? (
            <div className="redemption-list">
              {redemptions.map((redemption) => (
                <div key={redemption.id} className="redemption-item">
                  <span>Amount: ₱{redemption.amount.toFixed(2)}</span>
                  <span>
                    Points: {redemption.points}
                  </span>
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