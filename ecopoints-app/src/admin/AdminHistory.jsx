import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import AdminSidebar from '../components/AdminSidebar';
import { useNavigate } from 'react-router-dom';
import '../styles/AdminHistory.css';
import { supabase } from '../config/supabase';

const AdminHistory = () => {
  const [approvedRedemptions, setApprovedRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchApprovedRedemptions();
  }, []);

  const fetchApprovedRedemptions = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Admin authentication required');
      }

      // Verify admin status
      const { data: adminCheck, error: adminError } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', session.user.id)
        .single();

      if (adminError || !adminCheck?.is_admin) {
        throw new Error('Admin access required');
      }

      // First get all processed requests
      const { data: historyData, error } = await supabase
        .from('redemption_requests')
        .select('*')
        .not('status', 'eq', 'pending')
        .order('processed_at', { ascending: false });

      if (error) {
        console.error('History fetch error:', error);
        throw error;
      }

      // Then get user and processor details separately
      const transformedData = await Promise.all(historyData.map(async (item) => {
        // Get user name
        const { data: userData } = await supabase
          .from('users')
          .select('name')
          .eq('id', item.user_id)
          .single();

        // Get processor email
        const { data: processorData } = await supabase
          .from('users')
          .select('email')
          .eq('id', item.processed_by)
          .single();

        return {
          id: item.id,
          user_name: userData?.name || 'Unknown',
          amount: item.amount,
          points: item.points || item.amount,
          status: item.status,
          approved_by_name: processorData?.email || 'Unknown',
          processed_at: item.processed_at,
          created_at: item.created_at
        };
      }));

      console.log('History data:', transformedData);
      setApprovedRedemptions(transformedData);
      setError('');
    } catch (error) {
      console.error('Fetch error:', error);
      setError('Failed to load redemption history: ' + error.message);
      setApprovedRedemptions([]);
      
      if (error.message.includes('Admin')) {
        navigate('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const handleLogout = () => {
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_name');
    localStorage.removeItem('is_admin');
    navigate('/');
  };

  return (
    <div className="app-container">
      <Header 
        userName={localStorage.getItem('user_name')}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      <AdminSidebar 
        isOpen={isSidebarOpen}
        onLogout={handleLogout}
      />
      <div className="dashboard-container">
        <main className="history-container">
          <h1>Approved Redemption History</h1>
          
          {loading ? (
            <div className="loading">Loading history...</div>
          ) : error ? (
            <div className="error-message">{error}</div>
          ) : approvedRedemptions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-content">
                <i className="fas fa-history"></i>
                <h2>No History Found</h2>
                <p>There are no approved redemptions to display.</p>
              </div>
            </div>
          ) : (
            <div className="history-table-container">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Date Requested</th>
                    <th>User</th>
                    <th>Amount (₱)</th>
                    <th>Points</th>
                    <th>Status</th>
                    <th>Approved By</th>
                    <th>Processed Date</th>
                  </tr>
                </thead>
                <tbody>
                  {approvedRedemptions.map((redemption) => (
                    <tr key={redemption.id}>
                      <td>{formatDate(redemption.created_at)}</td>
                      <td>{redemption.user_name}</td>
                      <td>₱{redemption.amount?.toFixed(2) || '0.00'}</td>
                      <td>{redemption.points?.toFixed(2) || '0.00'}</td>
                      <td>
                        <span className="status approved">
                          {redemption.status || 'approved'}
                        </span>
                      </td>
                      <td>{redemption.approved_by_name}</td>
                      <td>{formatDate(redemption.processed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminHistory;