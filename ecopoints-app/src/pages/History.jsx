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
    let subscription;

    const fetchTransactionHistory = async () => {
      try {
        setLoading(true);

        // Authenticate user
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
        if (authError || !authUser) {
          throw new Error('Authentication required');
        }

        // Fetch history
        const { data: historyData, error: historyError } = await supabase
          .from('history')
          .select('id, type, details, created_at')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (historyError) throw historyError;

        // Map history to transactions
        const mappedTransactions = (historyData || []).map((item) => {
          if (item.type === 'recyclable') {
            return {
              id: item.id,
              type: item.details.material || 'Recyclable',
              date: item.created_at,
              quantity: item.details.quantity || 1,
              points: item.details.points || 0,
              status: 'Completed',
            };
          } else if (item.type === 'redemption') {
            return {
              id: item.id,
              type: 'Redemption',
              date: item.created_at,
              quantity: 1,
              points: item.details.points || 0,
              status: item.details.status || 'Pending',
            };
          }
          return null;
        }).filter((t) => t !== null);

        setTransactions(mappedTransactions);
        applyFilters(mappedTransactions, searchQuery, filterType);

        // Subscribe to new history entries
        subscription = supabase
          .channel('history_changes')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'history',
              filter: `user_id=eq.${authUser.id}`,
            },
            (payload) => {
              console.log('New history entry:', payload);
              const newTransaction = (() => {
                if (payload.new.type === 'recyclable') {
                  return {
                    id: payload.new.id,
                    type: payload.new.details.material || 'Recyclable',
                    date: payload.new.created_at,
                    quantity: payload.new.details.quantity || 1,
                    points: payload.new.details.points || 0,
                    status: 'Completed',
                  };
                } else if (payload.new.type === 'redemption') {
                  return {
                    id: payload.new.id,
                    type: 'Redemption',
                    date: payload.new.created_at,
                    quantity: 1,
                    points: payload.new.details.points || 0,
                    status: payload.new.details.status || 'Pending',
                  };
                }
                return null;
              })();

              if (newTransaction) {
                setTransactions((prev) => {
                  const updated = [newTransaction, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date));
                  applyFilters(updated, searchQuery, filterType);
                  return updated;
                });
              }
            }
          )
          .subscribe((status, err) => {
            if (err || status === 'CLOSED') {
              console.error('Subscription error:', err || status);
              setError('Failed to subscribe to history updates.');
            }
          });

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
      if (subscription) supabase.removeChannel(subscription);
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
        const pointsMatch = transaction.points.toString().includes(lowerQuery);
        return typeMatch || statusMatch || dateMatch || pointsMatch;
      });
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter((transaction) => {
        if (typeFilter === 'recyclable') {
          return transaction.type !== 'Redemption';
        }
        return transaction.type.toLowerCase() === typeFilter.toLowerCase();
      });
    }

    setFilteredTransactions(filtered);
    setCurrentPage(1);
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
                  <option value="recyclable">Recyclables</option>
                  <option value="redemption">Redemptions</option>
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
            <button onClick={() => window.location.reload()} className="retry-btn">
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
                      <td className="points-cell">{transaction.points.toFixed(0)}</td>
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