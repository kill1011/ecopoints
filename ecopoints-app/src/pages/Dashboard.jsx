import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faExchangeAlt, faUser, faBell } from '@fortawesome/free-solid-svg-icons';
import '../styles/Dashboard.css';
import { supabase } from '../config/supabase';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    name: 'Guest',
    points: 0,
    money: 0,
    bottles: 0,
    cans: 0,
  });
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [error, setError] = useState(null);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const fetchUserStats = async () => {
    try {
      let { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        throw new Error('Authentication required: ' + sessionError.message);
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

      const userId = session.user.id;
      console.log('Fetching stats for user ID:', userId);

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('name, points, money, bottles, cans')
        .eq('id', userId)
        .single();

      if (userError) {
        console.error('User fetch error:', userError);
        throw new Error('Failed to fetch user data: ' + userError.message);
      }

      if (!userData) {
        throw new Error('User profile not found.');
      }

      const updatedStats = {
        name: userData.name || session.user.user_metadata?.name || 'Guest',
        points: userData.points || 0,
        money: userData.money || 0,
        bottles: userData.bottles || 0,
        cans: userData.cans || 0,
      };

      const { data: notificationData, error: notificationError } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'unread')
        .order('created_at', { ascending: false });

      if (notificationError) {
        console.error('Notification fetch error:', notificationError);
        throw new Error('Failed to fetch notifications: ' + notificationError.message);
      }

      localStorage.setItem('user', JSON.stringify({
        id: userId,
        email: session.user.email,
        name: updatedStats.name,
        points: updatedStats.points,
        money: updatedStats.money,
        bottles: updatedStats.bottles,
        cans: updatedStats.cans,
      }));

      setStats(updatedStats);
      setNotifications(notificationData || []);
      setError(null);

      return userId;
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError(error.message || 'Error loading user data. Please try again.');
      if (error.message.includes('Authentication required') || error.message.includes('Unable to refresh session')) {
        localStorage.clear();
        navigate('/login');
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let userSubscription;
    let notificationSubscription;

    const setupSubscriptions = async () => {
      try {
        const userId = await fetchUserStats();

        userSubscription = supabase
          .channel('public:users')
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'users',
              filter: `id=eq.${userId}`,
            },
            (payload) => {
              console.log('Received real-time update for users:', payload);
              const updatedUser = payload.new;
              const newStats = {
                name: updatedUser.name || stats.name,
                points: updatedUser.points || 0,
                money: updatedUser.money || 0,
                bottles: updatedUser.bottles || 0,
                cans: updatedUser.cans || 0,
              };
              setStats(newStats);
              localStorage.setItem('user', JSON.stringify({
                id: userId,
                email: updatedUser.email || localStorage.getItem('user')?.email,
                ...newStats,
              }));
            }
          )
          .subscribe((status, error) => {
            console.log('User subscription status:', status);
            if (error) {
              console.error('User subscription error:', error);
            }
          });

        notificationSubscription = supabase
          .channel('public:user_notifications')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'user_notifications',
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              console.log('Received real-time update for notifications:', payload);
              setNotifications((prev) => [payload.new, ...prev]);
            }
          )
          .subscribe((status, error) => {
            console.log('Notification subscription status:', status);
            if (error) {
              console.error('Notification subscription error:', error);
            }
          });
      } catch (error) {
        // Error already handled in fetchUserStats
      }
    };

    setupSubscriptions();

    // Listen for custom event from Redemption.jsx
    const handleBalanceUpdate = (event) => {
      console.log('Received userBalanceUpdated event:', event.detail);
      setStats((prev) => ({
        ...prev,
        points: event.detail.points,
        money: event.detail.money,
      }));
    };

    window.addEventListener('userBalanceUpdated', handleBalanceUpdate);

    return () => {
      if (userSubscription) {
        supabase.removeChannel(userSubscription);
      }
      if (notificationSubscription) {
        supabase.removeChannel(notificationSubscription);
      }
      window.removeEventListener('userBalanceUpdated', handleBalanceUpdate);
    };
  }, [navigate]);

  useEffect(() => {
    console.log('Dashboard Stats Updated:', stats);
  }, [stats]);

  const markNotificationAsRead = async (notificationId) => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ status: 'read' })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(notifications.filter((notif) => notif.id !== notificationId));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await fetchUserStats();
  };

  return (
    <div className="app-container">
      <Header userName={stats.name} toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
      <Sidebar isOpen={isSidebarOpen} />
      
      <div className="dashboard-container">
        {loading ? (
          <div className="loading-state">Loading dashboard data...</div>
        ) : error ? (
          <div className="error-state">
            <p>{error}</p>
            <button onClick={() => window.location.reload()}>
              Retry
            </button>
            <button onClick={() => navigate('/login')}>
              Go to Login
            </button>
          </div>
        ) : (
          <main className="main-content">
            <div className="user-profile-section">
              <div className="user-avatar">
                <FontAwesomeIcon icon={faUser} />
              </div>
              <div className="user-info">
                <h1>{getGreeting()}, {stats.name}!</h1>
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-card" id="pointsCard">
                <FontAwesomeIcon icon={faRecycle} className="stat-icon" />
                <div className="stat-value">{stats.points.toLocaleString()}</div>
                <div className="stat-label">Total Points</div>
              </div>

              <div className="stat-card" id="moneyCard">
                <FontAwesomeIcon icon={faExchangeAlt} className="stat-icon" />
                <div className="stat-value">₱{stats.money.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                <div className="stat-label">Available Balance</div>
              </div>

              <div className="stat-card" id="cansCard">
                <div className="stat-value">{stats.cans.toLocaleString()}</div>
                <div className="stat-label">Cans Recycled</div>
              </div>

              <div className="stat-card" id="bottlesCard">
                <div className="stat-value">{stats.bottles.toLocaleString()}</div>
                <div className="stat-label">Bottles Recycled</div>
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
};

export default Dashboard;