import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';

const AdminApproval = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          navigate('/login');
          return;
        }

        // Check if user is admin
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('is_admin')
          .eq('id', session.user.id)
          .single();

        if (userError || !userData.is_admin) {
          navigate('/dashboard');
          return;
        }

        // Fetch pending redemption requests
        const { data: redemptionData, error: redemptionError } = await supabase
          .from('redemption_requests')
          .select('*, users(name)')
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (redemptionError) {
          throw new Error('Failed to fetch redemption requests: ' + redemptionError.message);
        }

        setRequests(redemptionData || []);
        setLoading(false);
      } catch (error) {
        setError(error.message);
        setLoading(false);
      }
    };

    fetchRequests();
  }, [navigate]);

  const handleApprove = async (requestId, userId, amount, points) => {
    try {
      // Update redemption request status to approved
      const { error: updateError } = await supabase
        .from('redemption_requests')
        .update({ status: 'approved' })
        .eq('id', requestId);

      if (updateError) {
        throw new Error('Failed to approve redemption request: ' + updateError.message);
      }

      // Fetch the user's current balance (if not already deducted)
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('points, money')
        .eq('id', userId)
        .single();

      if (userError) {
        throw new Error('Failed to fetch user data: ' + userError.message);
      }

      // If the deduction was already made in Redemption.jsx, we can skip this step.
      // Otherwise, deduct the amount here (uncomment if needed):
      /*
      const newMoney = userData.money - amount;
      const newPoints = userData.points - points;

      const { error: updateUserError } = await supabase
        .from('users')
        .update({ points: newPoints, money: newMoney })
        .eq('id', userId);

      if (updateUserError) {
        throw new Error('Failed to update user balance: ' + updateUserError.message);
      }
      */

      // Create a notification for the user
      const { error: notificationError } = await supabase
        .from('user_notifications')
        .insert({
          user_id: userId,
          type: 'redemption_approved',
          message: `Your redemption request for ₱${amount.toFixed(2)} has been approved!`,
          status: 'unread',
          created_at: new Date().toISOString(),
        });

      if (notificationError) {
        throw new Error('Failed to send user notification: ' + notificationError.message);
      }

      // Update the admin notification status (if linked)
      await supabase
        .from('admin_notifications')
        .update({ status: 'read' })
        .eq('request_id', requestId)
        .eq('type', 'redemption_request');

      // Refresh the requests list
      setRequests(requests.filter((req) => req.id !== requestId));
    } catch (error) {
      setError(error.message);
    }
  };

  const handleReject = async (requestId, userId, amount, points) => {
    try {
      // Update redemption request status to rejected
      const { error: updateError } = await supabase
        .from('redemption_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId);

      if (updateError) {
        throw new Error('Failed to reject redemption request: ' + updateError.message);
      }

      // Since the points and money were already deducted in Redemption.jsx,
      // we need to restore them upon rejection
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('points, money')
        .eq('id', userId)
        .single();

      if (userError) {
        throw new Error('Failed to fetch user data: ' + userError.message);
      }

      const restoredPoints = userData.points + points;
      const restoredMoney = userData.money + amount;

      const { error: updateUserError } = await supabase
        .from('users')
        .update({ points: restoredPoints, money: restoredMoney })
        .eq('id', userId);

      if (updateUserError) {
        throw new Error('Failed to restore user balance: ' + updateUserError.message);
      }

      // Create a notification for the user
      const { error: notificationError } = await supabase
        .from('user_notifications')
        .insert({
          user_id: userId,
          type: 'redemption_rejected',
          message: `Your redemption request for ₱${amount.toFixed(2)} has been rejected.`,
          status: 'unread',
          created_at: new Date().toISOString(),
        });

      if (notificationError) {
        throw new Error('Failed to send user notification: ' + notificationError.message);
      }

      // Update the admin notification status (if linked)
      await supabase
        .from('admin_notifications')
        .update({ status: 'read' })
        .eq('request_id', requestId)
        .eq('type', 'redemption_request');

      // Refresh the requests list
      setRequests(requests.filter((req) => req.id !== requestId));
    } catch (error) {
      setError(error.message);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h1>Admin Approval</h1>
      {requests.length === 0 ? (
        <p>No pending redemption requests.</p>
      ) : (
        <div>
          {requests.map((request) => (
            <div key={request.id} className="request-item">
              <p>User: {request.users.name}</p>
              <p>Amount: ₱{request.amount.toFixed(2)}</p>
              <p>Points: {request.points}</p>
              <p>Status: {request.status}</p>
              <p>Requested: {new Date(request.created_at).toLocaleString()}</p>
              <button onClick={() => handleApprove(request.id, request.user_id, request.amount, request.points)}>
                Approve
              </button>
              <button onClick={() => handleReject(request.id, request.user_id, request.amount, request.points)}>
                Reject
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminApproval;