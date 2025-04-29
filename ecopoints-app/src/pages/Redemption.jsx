import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExchangeAlt, faHistory } from '@fortawesome/free-solid-svg-icons';
import { supabase } from '../config/supabase';
import '../styles/Redemption.css';

const Redemption = () => {
  const navigate = useNavigate();
  const [userData, setUserData] = useState({ points: 0, money: 0 });
  const [redeemAmount, setRedeemAmount] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingRedemptions, setPendingRedemptions] = useState([]);

  useEffect(() => {
    const checkAuthAndFetchDataTwice = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          throw sessionError;
        }

        if (!session) {
          navigate('/login');
          return;
        }

        // Store essential user data
        localStorage.setItem('user_id', session.user.id);
        localStorage.setItem('user_name', session.user.user_metadata?.name || session.user.email);

        // Fetch user data and pending redemptions
        await Promise.all([
          fetchUserData(),
          fetchPendingRedemptions()
        ]);

      } catch (error) {
        console.error('Auth check failed:', error);
        navigate('/login');
      }
    };

    checkAuthAndFetchDataTwice();
  }, [navigate]);

  const fetchUserData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Fetch user data from user_stats table instead of users
      const { data: statsData, error } = await supabase
        .from('user_stats')
        .select('total_points, total_money')
        .eq('user_id', session.user.id)
        .single();

      if (error) {
        console.error('User stats fetch error:', error);
        if (error.code === 'PGRST116') {
          // No stats found, initialize them
          const { error: insertError } = await supabase
            .from('user_stats')
            .insert({
              user_id: session.user.id,
              total_bottle_count: 0,
              total_can_count: 0,
              total_points: 0,
              total_money: 0,
            });
          if (insertError) {
            console.error('Error initializing user stats:', insertError);
            throw new Error('Failed to initialize user stats: ' + insertError.message);
          }
          // Set default stats
          setUserData({ points: 0, money: 0 });
        } else {
          throw error;
        }
      } else {
        setUserData({
          points: statsData.total_points || 0,
          money: statsData.total_money || 0,
        });
      }

      setMessage('');
      setMessageType('');

    } catch (error) {
      console.error('Error fetching user data:', error);
      setUserData({ points: 0, money: 0 });
      setMessage('Error loading user data. Please try again.');
      setMessageType('error');
    }
  };

  const fetchPendingRedemptions = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const { data: redemptions, error } = await supabase
        .from('redemption_requests')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setPendingRedemptions(redemptions || []);
    } catch (error) {
      console.error('Error fetching pending redemptions:', error);
    }
  };

  const calculatePointsNeeded = (amount) => {
    return amount * 100; // 1 peso = 100 points
  };

  const handleRedeem = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Authentication required');
      }

      const amount = parseFloat(redeemAmount);

      if (isNaN(amount) || amount <= 0) {
        setMessage('Please enter a valid amount');
        setMessageType('error');
        return;
      }

      const pointsNeeded = calculatePointsNeeded(amount);

      // Fetch current user stats from user_stats table
      const { data: currentStats, error: statsError } = await supabase
        .from('user_stats')
        .select('total_points, total_money')
        .eq('user_id', session.user.id)
        .single();

      if (statsError) throw statsError;

      if (pointsNeeded > currentStats.total_points) {
        setMessage(`Insufficient points. You need ${pointsNeeded} points to redeem ₱${amount}`);
        setMessageType('error');
        return;
      }

      const newMoney = currentStats.total_money - amount;
      if (newMoney < 0) {
        setMessage(`Insufficient balance. You need ₱${amount} to redeem.`);
        setMessageType('error');
        return;
      }

      const newPoints = currentStats.total_points - pointsNeeded;

      // Update user_stats table instead of users
      const { error: updateError } = await supabase
        .from('user_stats')
        .update({ 
          total_points: newPoints,
          total_money: newMoney
        })
        .eq('user_id', session.user.id);

      if (updateError) throw updateError;

      const { data: redemption, error: redemptionError } = await supabase
        .from('redemption_requests')
        .insert({
          user_id: session.user.id,
          amount: amount,
          points: pointsNeeded,
          status: 'pending',
          created_at: new Date().toISOString()
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
          created_at: new Date().toISOString()
        });

      setMessage('Redemption request sent! Waiting for admin approval.');
      setMessageType('success');
      setRedeemAmount('');

      // Update localStorage to reflect the new balance immediately
      localStorage.setItem('user', JSON.stringify({
        ...JSON.parse(localStorage.getItem('user') || '{}'),
        points: newPoints,
        money: newMoney,
      }));

      // Dispatch a custom event to notify other components (e.g., Dashboard) of the update
      window.dispatchEvent(new CustomEvent('userBalanceUpdated', {
        detail: { points: newPoints, money: newMoney }
      }));

      await Promise.all([
        fetchUserData(),
        fetchPendingRedemptions()
      ]);

    } catch (error) {
      console.error('Redemption Error:', error);
      setMessage(error.message || 'Failed to submit redemption request');
      setMessageType('error');
      await fetchUserData();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Balance Redemption">
      <div className="redemption-grid">
        <div className="stats-card">
          <h3>Available Points</h3>
          <div className="points-value">{userData.points.toLocaleString()}</div>
          <h3>Available Balance</h3>
          <div className="money-value">
            ₱{userData.money.toFixed(2)}
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