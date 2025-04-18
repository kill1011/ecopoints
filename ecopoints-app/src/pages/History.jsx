import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHistory, faExchangeAlt, faRecycle, faSearch } from '@fortawesome/free-solid-svg-icons';
import { supabase } from '../config/supabase';
import { useNavigate } from 'react-router-dom';
import '../styles/History.css';

const History = () => {
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchTransactionHistory();
  }, []);

  const fetchTransactionHistory = async () => {
    try {
      setLoading(true);

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('Authentication required');
      }

      const [{ data: redemptionData, error: redemptionError }, { data: recyclableData, error: recyclableError }] = await Promise.all([
        supabase
          .from('redemption_requests')
          .select('id, user_id, amount, points, status, created_at, processed_at')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('recyclable_transactions')
          .select('id, user_id, type, quantity, points, money, created_at')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false }),
      ]);

      if (redemptionError) throw new Error(redemptionError.message || 'Failed to fetch redemption requests');
      if (recyclableError) throw new Error(recyclableError.message || 'Failed to fetch recyclable transactions');

      const redemptions = (redemptionData || []).map(item => ({
        id: item.id,
        type: 'redemption',
        date: item.created_at,
        amount: item.amount,
        points: item.points,
        status: item.status,
        processed_at: item.processed_at,
      }));

      const recyclables = (recyclableData || []).map(item => ({
        id: item.id,
        type: item.type, // 'bottle' or 'can'
        date: item.created_at,
        quantity: item.quantity,
        points: item.points,
        money: item.money,
        status: 'completed',
      }));

      const allTransactions = [...redemptions, ...recyclables].sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );

      setTransactions(allTransactions);
      setFilteredTransactions(allTransactions);
      setError('');
    } catch (error) {
      console.error('Error fetching history:', error);
      setError(
        error.message.includes('permission')
          ? 'Access denied. Please contact support.'
          : `Failed to load transaction history: ${error.message}`
      );
      setTransactions([]);
      setFilteredTransactions([]);
      if (error.message.includes('Authentication')) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    const query = e.target.value.toLowerCase();
    setSearchQuery(query);

    const filtered = transactions.filter((transaction) => {
      const typeMatch = transaction.type.toLowerCase().includes(query);
      const statusMatch = transaction.status.toLowerCase().includes(query);
      const dateMatch = formatDate(transaction.date).toLowerCase().includes(query);
      const pointsMatch = transaction.points?.toString().toLowerCase().includes(query);
      const moneyMatch = transaction.money?.toFixed(2).toLowerCase().includes(query);
      const amountMatch = transaction.amount?.toFixed(2).toLowerCase().includes(query);
      return typeMatch || statusMatch || dateMatch || pointsMatch || moneyMatch || amountMatch;
    });

    setFilteredTransactions(filtered);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved':
        return 'status-approved';
      case 'rejected':
        return 'status-rejected';
      case 'pending':
        return 'status-pending';
      case 'completed':
        return 'status-completed';
      default:
        return '';
    }
  };

  return (
    <Layout title="Transaction History">
      <div className="history-page">
        <div className="history-header">
          <div className="header-content">
            <h1>
              <FontAwesomeIcon icon={faHistory} className="header-icon" />
              Transaction History
            </h1>
            <div className="search-bar">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Search by type, status, date, points, or amount..."
                value={searchQuery}
                onChange={handleSearch}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="loader"></div>
            <p>Loading your transaction history...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <div className="error-icon">⚠️</div>
            <p>{error}</p>
            <button onClick={() => fetchTransactionHistory()} className="retry-btn">
              Try Again
            </button>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="empty-state">
            <FontAwesomeIcon icon={faHistory} className="empty-icon" />
            <h2>No Transactions Found</h2>
            <p>{searchQuery ? 'No matches for your search' : 'Your transaction history will appear here'}</p>
          </div>
        ) : (
          <div className="history-content">
            <div className="history-table-container">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Quantity</th>
                    <th>Points</th>
                    <th>Money</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((transaction) => (
                    <tr key={transaction.id} className={transaction.type}>
                      <td>{formatDate(transaction.date)}</td>
                      <td>
                        <span className="transaction-type">
                          <FontAwesomeIcon
                            icon={transaction.type === 'redemption' ? faExchangeAlt : faRecycle}
                            className="type-icon"
                          />
                          {transaction.type}
                        </span>
                      </td>
                      <td>{transaction.quantity || '-'}</td>
                      <td className="points-cell">
                        {(transaction.points || 0).toFixed(2)}
                      </td>
                      <td className="money-cell">
                        ₱{(transaction.type === 'redemption' ? transaction.amount || 0 : transaction.money || 0).toFixed(2)}
                      </td>
                      <td>
                        <span className={`status ${getStatusClass(transaction.status)}`}>
                          {transaction.status}
                        </span>
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