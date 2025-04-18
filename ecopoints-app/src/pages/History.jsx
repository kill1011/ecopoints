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
  const [filterType, setFilterType] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const navigate = useNavigate();

  useEffect(() => {
    let subscriptionRecyclables, subscriptionRedemptions;

    const fetchTransactionHistory = async () => {
      try {
        setLoading(true);

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          throw new Error('Authentication required');
        }

        const userId = session.user.id;

        const [{ data: redemptionData, error: redemptionError }, { data: recyclableData, error: recyclableError }] = await Promise.all([
          supabase
            .from('redemption_requests')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50),
          supabase
            .from('recyclable_transactions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50),
        ]);

        if (redemptionError) throw redemptionError;
        if (recyclableError) throw recyclableError;

        const redemptions = (redemptionData || []).map((item) => ({
          id: item.id,
          type: 'Redemption',
          date: item.created_at,
          amount: item.amount,
          points: item.points,
          money: item.amount,
          status: item.status,
          processed_at: item.processed_at,
          quantity: 1,
        }));

        const recyclables = (recyclableData || []).map((item) => ({
          id: item.id,
          type: item.type,
          date: item.created_at,
          quantity: item.quantity,
          points: item.points,
          money: item.money || (item.points / 100),
          status: 'Completed',
        }));

        const allTransactions = [...redemptions, ...recyclables].sort((a, b) => new Date(b.date) - new Date(a.date));

        setTransactions(allTransactions);
        applyFilters(allTransactions, searchQuery, filterType);

        // Real-time subscriptions
        subscriptionRecyclables = supabase
          .channel('recyclable_transactions_changes')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'recyclable_transactions',
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              console.log('New recyclable transaction:', payload);
              const newTransaction = {
                id: payload.new.id,
                type: payload.new.type,
                date: payload.new.created_at,
                quantity: payload.new.quantity,
                points: payload.new.points,
                money: payload.new.money || (payload.new.points / 100),
                status: 'Completed',
              };
              setTransactions((prev) => {
                const updated = [newTransaction, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date));
                applyFilters(updated, searchQuery, filterType);
                return updated;
              });
            }
          )
          .subscribe();

        subscriptionRedemptions = supabase
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
              setTransactions((prev) => {
                let updated;
                if (payload.eventType === 'INSERT') {
                  const newTransaction = {
                    id: payload.new.id,
                    type: 'Redemption',
                    date: payload.new.created_at,
                    amount: payload.new.amount,
                    points: payload.new.points,
                    money: payload.new.amount,
                    status: payload.new.status,
                    processed_at: payload.new.processed_at,
                    quantity: 1,
                  };
                  updated = [newTransaction, ...prev];
                } else if (payload.eventType === 'UPDATE') {
                  updated = prev.map((t) =>
                    t.id === payload.new.id && t.type === 'Redemption'
                      ? { ...t, status: payload.new.status, processed_at: payload.new.processed_at }
                      : t
                  );
                } else {
                  return prev;
                }
                updated = updated.sort((a, b) => new Date(b.date) - new Date(a.date));
                applyFilters(updated, searchQuery, filterType);
                return updated;
              });
            }
          )
          .subscribe();

        setError('');
      } catch (error) {
        console.error('Error fetching history:', error);
        setError('Failed to load transaction history: ' + error.message);
        setTransactions([]);
        setFilteredTransactions([]);
        if (error.message.includes('Authentication')) {
          navigate('/login');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTransactionHistory();

    return () => {
      if (subscriptionRecyclables) supabase.removeChannel(subscriptionRecyclables);
      if (subscriptionRedemptions) supabase.removeChannel(subscriptionRedemptions);
    };
  }, [navigate]);

  const applyFilters = (transactions, query, typeFilter) => {
    let filtered = transactions;

    if (query) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter((transaction) => {
        const typeMatch = transaction.type.toLowerCase().includes(lowerQuery);
        const statusMatch = transaction.status.toLowerCase().includes(lowerQuery);
        const dateMatch = formatDate(transaction.date).toLowerCase().includes(lowerQuery);
        const pointsMatch = transaction.points?.toString().includes(lowerQuery);
        const moneyMatch = transaction.money?.toString().includes(lowerQuery);
        return typeMatch || statusMatch || dateMatch || pointsMatch || moneyMatch;
      });
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter((transaction) =>
        transaction.type.toLowerCase() === typeFilter.toLowerCase()
      );
    }

    setFilteredTransactions(filtered);
    setCurrentPage(1); // Reset to first page on filter change
  };

  const handleSearch = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    applyFilters(transactions, query, filterType);
  };

  const handleFilterChange = (e) => {
    const type = e.target.value;
    setFilterType(type);
    applyFilters(transactions, searchQuery, type);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredTransactions.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  return (
    <Layout title="Transaction History">
      <div className="history-page">
        <div className="history-header">
          <div className="header-content">
            <h1>
              <FontAwesomeIcon icon={faHistory} className="header-icon" />
              Transaction History
            </h1>
            <div className="controls">
              <div className="search-bar">
                <FontAwesomeIcon icon={faSearch} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search by type, status, date, points..."
                  value={searchQuery}
                  onChange={handleSearch}
                />
              </div>
              <div className="filter-bar">
                <select value={filterType} onChange={handleFilterChange} className="filter-select">
                  <option value="all">All Types</option>
                  <option value="redemption">Redemptions</option>
                  <option value="plastic bottle">Plastic Bottles</option>
                  <option value="can">Cans</option>
                </select>
              </div>
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
            <p>{searchQuery || filterType !== 'all' ? 'No matches for your search or filter' : 'Your transaction history will appear here'}</p>
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
                  {currentItems.map((transaction) => (
                    <tr key={transaction.id} className={transaction.type.toLowerCase().replace(' ', '-')}>
                      <td>{formatDate(transaction.date)}</td>
                      <td>
                        <span className="transaction-type">
                          <FontAwesomeIcon
                            icon={transaction.type === 'Redemption' ? faExchangeAlt : faRecycle}
                            className="type-icon"
                          />
                          {transaction.type}
                        </span>
                      </td>
                      <td>{transaction.quantity}</td>
                      <td className="points-cell">{transaction.points.toFixed(2)}</td>
                      <td className="money-cell">₱{transaction.money.toFixed(2)}</td>
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
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  onClick={() => paginate(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="pagination-btn"
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => paginate(page)}
                    className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => paginate(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="pagination-btn"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default History;