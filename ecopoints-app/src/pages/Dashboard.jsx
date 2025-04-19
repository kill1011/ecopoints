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

  const calculateMoneyFromPoints = (points) => {
    return points / 100; // 100 points = 1 peso
  };

  useEffect(() => {
    const fetchUserStats = async () => {
      try {
        // Get current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
          setError('Authentication required. Please log in again.');
          localStorage.clear(); // Clear invalid session data
          navigate('/login');
          return;
        }

        const { data: userData, error } = await supabase
        .from('users')
        .select('points, name, bottles, cans')
        .eq('id', session.user.id)
        .limit(1)
        .maybeSingle();
        
        if (error) {
          console.error('Database Error:', error);
          if (error.message.includes('infinite recursion')) {
            throw new Error('Database access error: Security policy issue. Please contact support.');
          }
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
              email: session.user.email,
              points: 0,
              bottles: 0,
              cans: 0,
              money: 0,
              is_admin: false,
            }])
            .select()
            .single();

          if (createError) {
            console.error('Profile creation error:', createError);
            throw new Error('Failed to create user profile: ' + createError.message);
          }

          // Update localStorage with the new user profile
          localStorage.setItem('user', JSON.stringify(newUser));
          
          setStats({
            name: newUser.name,
            points: 0,
            money: 0,
            bottles: 0,
            cans: 0,
          });
        } else {
          const calculatedMoney = calculateMoneyFromPoints(userData.points || 0);
          const updatedStats = {
            name: userData.name || 'Guest',
            points: Number(userData.points) || 0,
            money: calculatedMoney,
            bottles: Number(userData.bottles) || 0,
            cans: Number(userData.cans) || 0,
          };

          // Update localStorage to keep it in sync
          localStorage.setItem('user', JSON.stringify({
            id: session.user.id,
            email: session.user.email,
            name: updatedStats.name,
            points: updatedStats.points,
            money: updatedStats.money,
            bottles: updatedStats.bottles,
            cans: updatedStats.cans,
            is_admin: JSON.parse(localStorage.getItem('is_admin') || 'false'),
          }));

          setStats(updatedStats);
        }

        setError(null);
      } catch (error) {
        console.error('Error fetching user data:', error);
        setError(error.message || 'Error loading user data. Please try again.');
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