import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faUser } from '@fortawesome/free-solid-svg-icons';
import Header from '../components/Header';
import AdminSidebar from '../components/AdminSidebar';
import { supabase } from '../config/supabase';
import '../styles/ViewAll.css';

const ViewAll = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchAllUsers();
  }, []);

  const fetchAllUsers = async () => {
    try {
      setLoading(true);
      console.log('Fetching all users...');

      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Authentication required');
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

      // Fetch all users with their data
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select(`
          id,
          name,
          email,
          points,
          money,
          bottles,
          cans,
          is_admin,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (usersError) {
        console.error('Users fetch error:', usersError);
        throw usersError;
      }

      console.log('Fetched users:', usersData);
      setUsers(usersData || []);
      setError(null);

    } catch (error) {
      console.error('Error fetching users:', error);
      setError(error.message);
      if (error.message.includes('auth') || error.message.includes('admin')) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user => 
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="admin-container">
      <Header 
        userName={localStorage.getItem('user_name')}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      <AdminSidebar isOpen={isSidebarOpen} />
      
      <div className="viewall-container">
        <div className="viewall-header">
          <h1>
            <FontAwesomeIcon icon={faUser} className="header-icon" />
            All Users
          </h1>
          <div className="search-bar">
            <FontAwesomeIcon icon={faSearch} className="search-icon" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="loader"></div>
            <p>Loading users...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p>{error}</p>
            <button onClick={fetchAllUsers} className="retry-btn">
              Try Again
            </button>
          </div>
        ) : (
          <div className="users-table-container">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Points</th>
                  <th>Balance</th>
                  <th>Bottles</th>
                  <th>Cans</th>
                  <th>Joined</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name || 'N/A'}</td>
                    <td>{user.email}</td>
                    <td>{user.points?.toLocaleString() || '0'}</td>
                    <td>₱{user.money?.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}</td>
                    <td>{user.bottles?.toLocaleString() || '0'}</td>
                    <td>{user.cans?.toLocaleString() || '0'}</td>
                    <td>{new Date(user.created_at).toLocaleDateString()}</td>
                    <td>
                      <span className={`status ${user.is_admin ? 'admin' : 'user'}`}>
                        {user.is_admin ? 'Admin' : 'User'}
                      </span>
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

export default ViewAll;