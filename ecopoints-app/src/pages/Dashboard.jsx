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

      // Fetch user stats from user_stats table (as in Insert.jsx)
      const { data: statsData, error: statsError } = await supabase
        .from('user_stats')
        .select('total_bottle_count, total_can_count, total_points, total_money')
        .eq('user_id', userId)
        .single();

      if (statsError) {
        console.error('User stats fetch error:', statsError);
        if (statsError.code === 'PGRST116') {
          // No stats found, initialize them
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
          // Set default stats
          setStats({
            name: session.user.user_metadata?.name || 'Guest',
            points: 0,
            money: 0,
            bottles: 0,
            cans: 0,
          });
        } else {
          throw new Error('Failed to fetch user stats: ' + statsError.message);
        }
      } else {
        const updatedStats = {
          name: session.user.user_metadata?.name || 'Guest',
          points: statsData.total_points || 0,
          money: statsData.total_money || 0,
          bottles: statsData.total_bottle_count || 0,
          cans: statsData.total_can_count || 0,
        };

        localStorage.setItem('users', JSON.stringify({
          id: userId,
          email: session.user.email,
          name: updatedStats.name,
          points: updatedStats.points,
          money: updatedStats.money,
          bottles: updatedStats.bottles,
          cans: updatedStats.cans,
        }));

        setStats(updatedStats);
      }

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

        // Update subscription to listen to user_stats table instead of users
        userSubscription = supabase
          .channel('public:user_stats')
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'user_stats',
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              console.log('Received real-time update for user_stats:', payload);
              const updatedStats = payload.new;
              const newStats = {
                name: stats.name, // Name isn't in user_stats, preserve it
                points: updatedStats.total_points || 0,
                money: updatedStats.total_money || 0,
                bottles: updatedStats.total_bottle_count || 0,
                cans: updatedStats.total_can_count || 0,
              };
              setStats(newStats);
              localStorage.setItem('user', JSON.stringify({
                id: userId,
                email: localStorage.getItem('user')?.email,
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