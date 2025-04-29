import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faExchangeAlt, faUser } from '@fortawesome/free-solid-svg-icons';
import '../styles/Dashboard.css';
import { supabase } from '../config/supabase';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(() => {
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    return {
      name: storedUser.name || 'Guest',
      points: storedUser.points || 0,
      money: storedUser.money || 0,
      bottles: storedUser.bottles || 0,
      cans: storedUser.cans || 0,
    };
  });
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [error, setError] = useState(null);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  useEffect(() => {
    let subscription;

    const fetchUserStats = async () => {
      try {
        // Get current session
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

        // Fetch user data directly from the users table
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

        // Update localStorage
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
        setError(null);

        // Set up real-time subscription for user updates
        subscription = supabase
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
                email: session.user.email,
                ...newStats,
              }));
            }
          )
          .subscribe();
      } catch (error) {
        console.error('Error fetching user data:', error);
        setError(error.message || 'Error loading user data. Please try again.');
        if (error.message.includes('Authentication required') || error.message.includes('Unable to refresh session')) {
          localStorage.clear();
          navigate('/login');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchUserStats();

    // Cleanup subscription on component unmount
    return () => {
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, [navigate]);

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