import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faExchangeAlt, faUser } from '@fortawesome/free-solid-svg-icons';
import '../styles/Dashboard.css';
import { supabase } from '../config/supabase';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
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
      console.log('Authenticated user ID:', userId);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error('User fetch error:', userError);
        throw new Error('Failed to fetch user profile: ' + userError.message);
      }

      console.log('User data from getUser:', user);
      console.log('User metadata:', user?.user_metadata);

      let userName = user?.user_metadata?.name;
      if (!userName) {
        console.log('No name found in user_metadata, setting a default name...');
        const { error: updateError } = await supabase.auth.updateUser({
          data: { name: 'User' + userId.slice(0, 8) },
        });
        if (updateError) {
          console.error('Error updating user metadata:', updateError);
        } else {
          userName = 'User' + userId.slice(0, 8);
        }
      }
      userName = userName || 'Guest';
      console.log('Fetched user name:', userName);

      let { data: statsData, error: statsError } = await supabase
        .from('user_stats')
        .select('total_bottle_count, total_can_count, total_points, total_money')
        .eq('user_id', userId)
        .single();

      if (statsError) {
        console.error('User stats fetch error:', statsError);
        if (statsError.code === 'PGRST116') {
          console.log('No stats found for user ID:', userId, 'initializing...');
          const { error: insertError } = await supabase
            .from('user_stats')
            .insert({
              user_id: userId,
              total_bottle_count: 0,
              total_can_count: 0,
              total_points: 0,
              total_money: 0,
            });
          if (insertError) {
            console.error('Error initializing user stats:', insertError);
            throw new Error('Failed to initialize user stats: ' + insertError.message);
          }
          statsData = {
            total_bottle_count: 0,
            total_can_count: 0,
            total_points: 0,
            total_money: 0,
          };
        } else {
          throw new Error('Failed to fetch user stats: ' + statsError.message);
        }
      }

      console.log('Fetched stats from user_stats:', statsData);
      const updatedStats = {
        name: userName,
        points: statsData.total_points || 0,
        money: statsData.total_money || 0,
        bottles: statsData.total_bottle_count || 0,
        cans: statsData.total_can_count || 0,
      };

      const userData = {
        id: userId,
        email: session.user.email,
        name: updatedStats.name,
        points: updatedStats.points,
        money: updatedStats.money,
        bottles: updatedStats.bottles,
        cans: updatedStats.cans,
      };
      localStorage.setItem('user', JSON.stringify(userData));
      setStats(updatedStats);

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
          .channel('public:user_stats')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'user_stats',
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              console.log('Received real-time update for user_stats:', payload);
              if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                const updatedStats = payload.new;
                setStats((prev) => ({
                  ...prev,
                  points: updatedStats.total_points || 0,
                  money: updatedStats.total_money || 0,
                  bottles: updatedStats.total_bottle_count || 0,
                  cans: updatedStats.total_can_count || 0,
                }));
                const userData = {
                  id: userId,
                  email: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).email : '',
                  name: stats.name,
                  points: updatedStats.total_points || 0,
                  money: updatedStats.total_money || 0,
                  bottles: updatedStats.total_bottle_count || 0,
                  cans: updatedStats.total_can_count || 0,
                };
                localStorage.setItem('user', JSON.stringify(userData));
              }
            }
          )
          .subscribe((status, error) => {
            console.log('User subscription status:', status);
            if (error) {
              console.error('User subscription error:', error);
              fetchUserStats();
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

    const handleBalanceUpdate = (event) => {
      console.log('Received userBalanceUpdated event:', event.detail);
      const updatedStats = {
        points: event.detail.points || stats.points,
        money: event.detail.money || stats.money,
        bottles: event.detail.bottles || stats.bottles,
        cans: event.detail.cans || stats.cans,
        name: stats.name,
      };
      setStats(updatedStats);
      const updatedUserData = {
        id: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).id : '',
        email: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).email : '',
        name: updatedStats.name,
        points: updatedStats.points,
        money: updatedStats.money,
        bottles: updatedStats.bottles,
        cans: updatedStats.cans,
      };
      localStorage.setItem('user', JSON.stringify(updatedUserData));
      localStorage.setItem('pendingBalanceUpdate', JSON.stringify(updatedStats));
    };

    window.addEventListener('userBalanceUpdated', handleBalanceUpdate);

    const pendingUpdate = localStorage.getItem('pendingBalanceUpdate');
    if (pendingUpdate) {
      console.log('Applying pending balance update from localStorage:', pendingUpdate);
      const parsedUpdate = JSON.parse(pendingUpdate);
      setStats((prev) => ({
        ...prev,
        points: parsedUpdate.points || prev.points,
        money: parsedUpdate.money || prev.money,
        bottles: parsedUpdate.bottles || prev.bottles,
        cans: parsedUpdate.cans || prev.cans,
      }));
      localStorage.removeItem('pendingBalanceUpdate');
    }

    return () => {
      if (userSubscription) {
        supabase.removeChannel(userSubscription);
      }
      if (notificationSubscription) {
        supabase.removeChannel(notificationSubscription);
      }
      window.removeEventListener('userBalanceUpdated', handleBalanceUpdate);
    };
  }, [navigate, stats.name]);

  useEffect(() => {
    console.log('Route changed to:', location.pathname);
    if (location.pathname === '/dashboard') {
      console.log('Refetching stats due to navigation...');
      fetchUserStats();
    }
  }, [location]);

  useEffect(() => {
    const interval = setInterval(() => {
      console.log('Polling for stats updates...');
      fetchUserStats();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

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
            <button onClick={() => window.location.reload()}>Retry</button>
            <button onClick={() => navigate('/login')}>Go to Login</button>
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
                <div className="stat-value">
                  ₱{(stats.points / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
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