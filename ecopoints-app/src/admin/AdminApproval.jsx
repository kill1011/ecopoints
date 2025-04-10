import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Sidebar from '../components/AdminSidebar';
import { supabase } from '../config/supabase';
import '../styles/AdminApproval.css';

const AdminApproval = () => {
  const navigate = useNavigate();
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const fetchPendingRequests = async () => {
    try {
      setLoading(true);
      console.log('Fetching pending requests...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const { data: requests, error: requestsError } = await supabase
        .from('redemption_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (requestsError) throw requestsError;

      const transformedRequests = await Promise.all(requests.map(async (request) => {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('name, money')
          .eq('id', request.user_id)
          .single();

        if (userError) {
          console.error('User fetch error:', userError);
          return {
            ...request,
            user_name: 'Unknown',
            user_balance: 0
          };
        }

        return {
          ...request,
          user_name: userData?.name || 'Unknown',
          user_balance: userData?.money || 0
        };
      }));

      console.log('Fetched requests:', transformedRequests);
      setPendingRequests(transformedRequests);
      setMessage('');
      setMessageType('');

    } catch (error) {
      console.error('Fetch error:', error);
      setMessage(`Failed to fetch pending requests: ${error.message}`);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) throw sessionError;

        if (!session) {
          navigate('/login');
          return;
        }

        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('is_admin')
          .eq('id', session.user.id)
          .single();

        if (userError) throw userError;

        if (!userData?.is_admin) {
          navigate('/dashboard');
          return;
        }

        localStorage.setItem('is_admin', 'true');
        
        await fetchPendingRequests();
        const notificationInterval = setInterval(checkNewNotifications, 10000);
        return () => clearInterval(notificationInterval);

      } catch (error) {
        console.error('Auth check failed:', error);
        navigate('/login');
      }
    };

    checkAuth();
  }, [navigate]);

  const checkNewNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_notifications')
        .select('*')
        .eq('status', 'unread')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        setNotifications(data);
        data.forEach(notification => {
          if (Notification.permission === 'granted') {
            new Notification('New Redemption Request', {
              body: notification.message
            });
          }
        });
      }
    } catch (error) {
      console.error('Error checking notifications:', error);
    }
  };

  const handleApproval = async (requestId, isApproved) => {
    try {
      setLoading(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const { data: request, error: requestError } = await supabase
        .from('redemption_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (requestError) {
        console.error('Request fetch error:', requestError);
        throw new Error('Failed to fetch request details');
      }

      if (!request) {
        throw new Error('Redemption request not found');
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('name, money')
        .eq('id', request.user_id)
        .single();

      if (userError) {
        console.error('User fetch error:', userError);
        throw new Error('Failed to fetch user details');
      }

      const { error: updateError } = await supabase
        .from('redemption_requests')
        .update({ 
          status: isApproved ? 'approved' : 'rejected',
          processed_by: session.user.id,
          processed_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (updateError) throw updateError;

      if (isApproved) {
        const { error: balanceError } = await supabase
          .from('users')
          .update({ 
            money: userData.money + request.amount // Add amount to money on approval
          })
          .eq('id', request.user_id);

        if (balanceError) throw balanceError;
      }

      await supabase
        .from('user_notifications')
        .insert({
          user_id: request.user_id,
          type: isApproved ? 'redemption_approved' : 'redemption_rejected',
          message: `Your redemption request for ₱${request.amount.toFixed(2)} has been ${isApproved ? 'approved' : 'rejected'}.`,
          status: 'unread',
          created_at: new Date().toISOString()
        });

      await supabase
        .from('admin_notifications')
        .update({ status: 'read' })
        .eq('request_id', requestId);

      setPendingRequests(current => 
        current.filter(req => req.id !== requestId)
      );

      setMessage(`Redemption request ${isApproved ? 'approved' : 'rejected'} successfully`);
      setMessageType('success');

      setNotifications(current => 
        current.filter(notif => notif.request_id !== requestId)
      );

    } catch (error) {
      console.error('Approval error:', error);
      setMessage(error.message || `Failed to ${isApproved ? 'approve' : 'reject'} redemption`);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <Header 
        userName={localStorage.getItem('user_name')}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      <Sidebar isOpen={isSidebarOpen} />
      
      <div className="admin-approval-container">
        {notifications.length > 0 && (
          <div className="notifications-panel">
            <h3>New Requests</h3>
            {notifications.map(notification => (
              <div key={notification.id} className="notification-item">
                {notification.message}
                <span className="notification-time">
                  {new Date(notification.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}

        <h1>Pending Redemption Requests</h1>

        {message && (
          <div className={`message ${messageType}`}>
            {message}
          </div>
        )}

        {loading ? (
          <div className="loading">Loading requests...</div>
        ) : pendingRequests.length === 0 ? (
          <div className="empty-state">No pending redemption requests</div>
        ) : (
          <div className="requests-table-container">
            <table className="requests-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Amount (₱)</th>
                  <th>Current Balance</th>
                  <th>Request Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map((request) => (
                  <tr key={request.id}>
                    <td>{request.user_name}</td>
                    <td>₱{request.amount.toFixed(2)}</td>
                    <td>₱{request.user_balance.toFixed(2)}</td>
                    <td>{new Date(request.created_at).toLocaleDateString()}</td>
                    <td className="actions">
                      <button
                        className="approve-btn"
                        onClick={() => handleApproval(request.id, true)}
                        disabled={loading}
                      >
                        Approve
                      </button>
                      <button
                        className="reject-btn"
                        onClick={() => handleApproval(request.id, false)}
                        disabled={loading}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminApproval;