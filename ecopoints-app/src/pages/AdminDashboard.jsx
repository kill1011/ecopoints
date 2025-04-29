import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faUsers, 
  faCoins, 
  faRecycle, 
  faChartLine,
  faSearch 
} from '@fortawesome/free-solid-svg-icons';
import Header from '../components/Header';
import AdminSidebar from '../components/AdminSidebar';
import Footer from '../components/Footer';
import { supabase } from '../config/supabase';
import '../styles/AdminDashboard.css';

const AdminDashboard = () => {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalPoints: 0,
    totalMoney: 0,
    totalRecyclables: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    checkAdminAndLoadData();
  }, [navigate]);

  const fetchUsers = async () => {
    try {
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
        throw new Error(`Failed to fetch users data: ${usersError.message}`);
      }

      console.log('Fetched users:', usersData); // Log the fetched users
      return usersData || [];
    } catch (error) {
      throw error;
    }
  };

  const calculateStats = async (usersData) => {
    try {
      const totalUsers = usersData.length;
      const totalPoints = usersData.reduce((acc, user) => acc + (user.points || 0), 0);
      
      // Get all approved redemptions
      const { data: redemptions, error: redemptionError } = await supabase
        .from('redemption_requests')
        .select('amount')
        .eq('status', 'approved');

      if (redemptionError) throw redemptionError;

      // Calculate total money redeemed
      const totalMoneyRedeemed = redemptions?.reduce((acc, redemption) => acc + (redemption.amount || 0), 0) || 0;
      
      const totalRecyclables = usersData.reduce((acc, user) => acc + (user.bottles || 0) + (user.cans || 0), 0);

      setStats({
        totalUsers,
        totalPoints,
        totalMoney: totalMoneyRedeemed,
        totalRecyclables
      });
    } catch (error) {
      console.error('Error calculating stats:', error);
    }
  };

  const checkAdminAndLoadData = async () => {
    console.log('Starting admin dashboard load...');
    setLoading(true);
    try {
      // Attempt to refresh the session first
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        throw new Error(`Authentication failed: ${sessionError.message} (Code: ${sessionError.code || 'N/A'})`);
      }

      if (!session) {
        console.log('No active session, attempting to refresh...');
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          console.error('Session refresh error:', refreshError);
          throw new Error('Unable to refresh session');
        }
        session = refreshData.session;
      }

      console.log('Session found:', session.user.id);

      const { data: adminCheck, error: adminError } = await supabase
        .from('users')
        .select('is_admin, name, email')
        .eq('id', session.user.id)
        .single();

      if (adminError) {
        console.error('Admin check error:', adminError);
        throw new Error(`Failed to verify admin status: ${adminError.message}`);
      }

      if (!adminCheck?.is_admin) {
        throw new Error('Unauthorized access: User is not an admin');
      }

      localStorage.setItem('is_admin', 'true');
      localStorage.setItem('user_name', adminCheck.name || adminCheck.email);
      localStorage.setItem('user', JSON.stringify({
        name: adminCheck.name,
        email: adminCheck.email,
        is_admin: true
      }));

      console.log('Fetching users as admin...');

      try {
        const usersData = await fetchUsers();
        if (usersData.length === 0) {
          console.warn('No users found in the database');
        }
        setUsers(usersData);
        calculateStats(usersData);
        setError(null);
      } catch (error) {
        console.error('Users fetch error:', error);
        throw new Error(`Failed to fetch users data: ${error.message}`);
      }

    } catch (error) {
      console.error('Dashboard error:', error);
      setError(error.message);
      if (error.message.includes('auth') || error.message.includes('admin')) {
        localStorage.clear();
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-dashboard">
        <Header 
          userName={JSON.parse(localStorage.getItem('user'))?.name || 'Admin'}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
        />
        <div className="dashboard-content">
          <AdminSidebar isOpen={isSidebarOpen} />
          <main className="main-content">
            <div className="loading-spinner">Loading admin dashboard...</div>
          </main>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-dashboard">
        <Header 
          userName={JSON.parse(localStorage.getItem('user'))?.name || 'Admin'}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
        />
        <div className="dashboard-content">
          <AdminSidebar isOpen={isSidebarOpen} />
          <main className="main-content">
            <div className="error-container">
              <h2>Error Loading Dashboard</h2>
              <p>{error}</p>
              <button onClick={() => window.location.reload()}>
                Retry Loading
              </button>
            </div>
          </main>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <Header 
        userName={localStorage.getItem('user_name')}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      <AdminSidebar isOpen={isSidebarOpen} />
      
      <div className="dashboard-content">
        <main className="main-content">
          <div className="dashboard-header">
            <h1>Admin Dashboard</h1>
            <div className="search-bar">
              <FontAwesomeIcon icon={faSearch} />
              <input
                type="text"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card users">
              <div className="stat-icon">
                <FontAwesomeIcon icon={faUsers} />
              </div>
              <div className="stat-info">
                <h3>Total Users</h3>
                <p>{stats.totalUsers}</p>
              </div>
            </div>

            <div className="stat-card points">
              <div className="stat-icon">
                <FontAwesomeIcon icon={faCoins} />
              </div>
              <div className="stat-info">
                <h3>Total Points</h3>
                <p>{stats.totalPoints.toLocaleString()}</p>
              </div>
            </div>

            <div className="stat-card money">
              <div className="stat-icon">
                <FontAwesomeIcon icon={faChartLine} />
              </div>
              <div className="stat-info">
                <h3>Total Money Redeemed</h3>
                <p>₱{stats.totalMoney.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}</p>
              </div>
            </div>

            <div className="stat-card recyclables">
              <div className="stat-icon">
                <FontAwesomeIcon icon={faRecycle} />
              </div>
              <div className="stat-info">
                <h3>Total Recyclables</h3>
                <p>{stats.totalRecyclables.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="users-section">
            <div className="section-header">
              <h2>Recent Users</h2>
              <button 
                className="view-all-btn"
                onClick={() => navigate('/admin/viewall')}
              >
                View All
              </button>
            </div>

            <div className="users-table-container">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Points</th>
                    <th>Balance</th>
                    <th>Joined</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users
                    .filter(user => 
                      (user.name && user.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                      (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()))
                    )
                    .slice(0, 5)
                    .map((user) => (
                      <tr key={user.id}>
                        <td>{user.name || 'N/A'}</td>
                        <td>{user.email || 'N/A'}</td>
                        <td>{user.points?.toLocaleString() || 0}</td>
                        <td>₱{(user.money || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</td>
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
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
};

export default AdminDashboard;