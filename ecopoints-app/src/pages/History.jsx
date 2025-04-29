import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faHistory, 
  faExchangeAlt, 
  faSearch 
} from '@fortawesome/free-solid-svg-icons';
import { supabase } from '../config/supabase';
import { useNavigate } from 'react-router-dom';
import '../styles/History.css';

const History = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchTransactionHistory();
  }, []);

  const fetchTransactionHistory = async () => {
    try {
      setLoading(true);
      
      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('Authentication required');
      }

      // Get redemption requests only
      const { data: redemptionData, error: redemptionError } = await supabase
        .from('redemption_requests')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (redemptionError) {
        console.error("Redemption error details:", redemptionError);
        throw redemptionError;
      }

      // Transform redemption requests
      const redemptions = (redemptionData || []).map(item => ({
        id: item.id,
        type: 'redemption',
        date: item.created_at,
        amount: item.amount,
        points: item.points || item.amount,
        status: item.status,
        processed_at: item.processed_at
      }));

      setTransactions(redemptions);
      setError('');

    } catch (error) {
      console.error('Error fetching history:', error);
      setError('Failed to load redemption history: ' + error.message);
      setTransactions([]);
      
      if (error.message.includes('Authentication')) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved': return 'status-approved';
      case 'rejected': return 'status-rejected';
      case 'pending': return 'status-pending';
      default: return '';
    }
  };

  return (
    <Layout title="Redemption History">
      <div className="history-page">
        <div className="history-header">
          <div className="header-content">
            <h1>
              <FontAwesomeIcon icon={faHistory} className="header-icon" />
              Redemption History
            </h1>
            <div className="search-bar">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Search redemption transactions..."
                onChange={(e) => {/* Add search functionality later */}}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="loader"></div>
            <p>Loading your redemption history...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <div className="error-icon">⚠️</div>
            <p>{error}</p>
            <button onClick={() => fetchTransactionHistory()} className="retry-btn">
              Try Again
            </button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="empty-state">
            <FontAwesomeIcon icon={faHistory} className="empty-icon" />
            <h2>No Redemption Transactions Yet</h2>
            <p>Your redemption history will appear here</p>
          </div>
        ) : (
          <div className="history-content">
            <div className="history-table-container">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Amount (₱)</th>
                    <th>Points Used</th>
                    <th>Status</th>
                    <th>Processed At</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id} className={transaction.type}>
                      <td>{formatDate(transaction.date)}</td>
                      <td>
                        <span className="transaction-type">
                          <FontAwesomeIcon 
                            icon={faExchangeAlt} 
                            className="type-icon" 
                          />
                          {transaction.type}
                        </span>
                      </td>
                      <td>₱{transaction.amount?.toFixed(2) || '0.00'}</td>
                      <td className="points-cell">
                        {transaction.points?.toFixed(2) || '0.00'}
                      </td>
                      <td>
                        <span className={`status ${getStatusClass(transaction.status)}`}>
                          {transaction.status || 'pending'}
                        </span>
                      </td>
                      <td>
                        {transaction.processed_at ? formatDate(transaction.processed_at) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default History;