import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExchangeAlt, faHistory } from '@fortawesome/free-solid-svg-icons';
import { supabase } from '../config/supabase';
import '../styles/Redemption.css';

const Redemption = () => {
  const navigate = useNavigate();
  const [userPoints, setUserPoints] = useState(0);
  const [redeemAmount, setRedeemAmount] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingRedemptions, setPendingRedemptions] = useState([]);

  useEffect(() => {
    const checkAuthAndFetchData = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          console.error('Session error:', sessionError || 'No active session');
          navigate('/login');
          return;
        }

        await Promise.all([
          fetchUserData(session.user.id),
          fetchPendingRedemptions(session.user.id),
        ]);
      } catch (error) {
        console.error('Auth check failed:', error);
        setMessage(
          error.message.includes('permission')
            ? 'Access denied. Please contact support.'
            : 'Failed to initialize. Please log in.'
        );
        setMessageType('error');
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

      if (error) throw new Error(error.message || 'Failed to fetch user data');
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

  const fetchPendingRedemptions = async (userId) => {
    try {
      const { data: redemptions, error } = await supabase
        .from('redemption_requests')
        .select('id, amount, points, status, created_at')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message || 'Failed to fetch pending redemptions');

      setPendingRedemptions(redemptions || []);
    } catch (error) {
      console.error('Error fetching pending redemptions:', error);
      setMessage('Error loading pending redemptions: ' + error.message);
      setMessageType('error');
    }
  };

  const calculatePointsNeeded = (amount) => {
    return amount * 100; // 1 peso = 100 points
  };

  const handleRedeem = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setMessageType('');

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('Authentication required');
      }

      const amount = parseFloat(redeemAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Please enter a valid amount');
      }

      const pointsNeeded = calculatePointsNeeded(amount);

      const { data: currentUser, error: userError } = await supabase
        .from('users')
        .select('points, name')
        .eq('id', session.user.id)
        .single();

      if (userError) throw new Error(userError.message || 'Failed to fetch user data');

      if (pointsNeeded > currentUser.points) {
        throw new Error(`Insufficient points. You need ${pointsNeeded} points to redeem ₱${amount}`);
      }

      const newPoints = currentUser.points - pointsNeeded;

      const { error: updateError } = await supabase
        .from('users')
        .update({ points: newPoints })
        .eq('id', session.user.id);

      if (updateError) throw new Error(updateError.message || 'Failed to update user points');

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

      if (redemptionError) throw new Error(redemptionError.message || 'Failed to create redemption request');

      const { error: notificationError } = await supabase
        .from('admin_notifications')
        .insert({
          type: 'redemption_request',
          user_id: session.user.id,
          user_name: currentUser.name || session.user.email,
          message: `New redemption request: ₱${amount.toFixed(2)} (${pointsNeeded} points)`,
          request_id: redemption.id,
          status: 'unread',
          created_at: new Date().toISOString(),
        });

      if (notificationError) throw new Error(notificationError.message || 'Failed to create admin notification');

      setMessage('Redemption request sent! Waiting for admin approval.');
      setMessageType('success');
      setRedeemAmount('');

      await Promise.all([
        fetchUserData(session.user.id),
        fetchPendingRedemptions(session.user.id),
      ]);
    } catch (error) {
      console.error('Redemption Error:', error);
      setMessage(
        error.message.includes('permission')
          ? 'Access denied. Please contact support.'
          : error.message || 'Failed to submit redemption request'
      );
      setMessageType('error');
      await fetchUserData(session.user.id);
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
          <div className="money-value">
            ₱{(userPoints / 100).toFixed(2)}
          </div>
          <small className="conversion-note">100 points = ₱1</small>
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
                onChange={(e) => setRedeemAmount(e.target.value)}
                step="0.01"
                required
                placeholder="Enter amount to redeem"
              />
            </div>
            <button
              type="submit"
              className="redeem-button"
              disabled={loading || !redeemAmount || parseFloat(redeemAmount) <= 0}
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

        {pendingRedemptions.length > 0 && (
          <div className="pending-redemptions-card">
            <h3>Pending Requests</h3>
            <div className="redemption-list">
              {pendingRedemptions.map((redemption) => (
                <div key={redemption.id} className="pending-item">
                  <span>Amount: ₱{redemption.amount.toFixed(2)}</span>
                  <span>Points: {redemption.points}</span>
                  <span>Status: <span className="status pending">Pending</span></span>
                  <span>Requested: {new Date(redemption.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Redemption;