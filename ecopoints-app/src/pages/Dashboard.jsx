import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faExchangeAlt, faHistory, faUser } from '@fortawesome/free-solid-svg-icons';
import '../styles/Dashboard.css';
import { supabase } from '../config/supabase';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';

const Dashboard = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [stats, setStats] = useState({
    name: user.name || 'Guest',
    points: 0,
    money: 0,
    bottles: 0,
    cans: 0,
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

  const calculateMoneyFromPoints = (points) => {
    return points / 100; // 100 points = 1 peso
  };

  useEffect(() => {
    const fetchUserStats = async () => {
      try {
        // Get current session first
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
          setError('Authentication required');
          navigate('/login');
          return;
        }

        // Use the session user ID for the query
        const { data: userData, error } = await supabase
          .from('users')
          .select('points, money, name, bottles, cans')
          .eq('id', session.user.id)
          .limit(1)  // Add limit to ensure single row
          .maybeSingle();  // Use maybeSingle instead of single

        if (error) {
          console.error('Database Error:', error);
          throw new Error(error.message);
        }

        if (!userData) {
          console.log('No user data found, creating default profile...');
          
          // Create default user profile if none exists
          const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert([{
              id: session.user.id,
              name: session.user.user_metadata?.name || 'Guest',
              points: 0,
              money: 0,
              bottles: 0,
              cans: 0
            }])
            .select()
            .single();

          if (createError) throw createError;
          
          // Use the newly created user data
          setStats({
            name: newUser.name,
            points: 0,
            money: 0,
            bottles: 0,
            cans: 0
          });
        } else {
          // Calculate money based on points
          const calculatedMoney = calculateMoneyFromPoints(userData.points || 0);
          setStats({
            name: userData.name || 'Guest',
            points: Number(userData.points) || 0,
            money: calculatedMoney,
            bottles: Number(userData.bottles) || 0,
            cans: Number(userData.cans) || 0
          });
        }

        setError(null);

      } catch (error) {
        console.error('Error fetching user data:', error);
        setError('Error loading user data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserStats();
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