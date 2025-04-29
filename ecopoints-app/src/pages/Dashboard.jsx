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
          localStorage.clear();
          navigate('/login');
          return;
        }

        const userId = session.user.id;

        // Aggregate data from recyclables table
        const { data: recyclablesData, error: recyclablesError } = await supabase
          .from('recyclables')
          .select('material, quantity')
          .eq('user_id', userId);

        if (recyclablesError) {
          console.error('Recyclables fetch error:', recyclablesError);
          throw new Error('Failed to fetch recyclables: ' + recyclablesError.message);
        }

        let totalPoints = 0;
        let totalBottles = 0;
        let totalCans = 0;

        recyclablesData.forEach(record => {
          if (record.material === 'PLASTIC_BOTTLE') {
            totalBottles += record.quantity;
            totalPoints += record.quantity * 3; // Updated: 3 points per bottle
          } else if (record.material === 'CAN') {
            totalCans += record.quantity;
            totalPoints += record.quantity * 5; // Updated: 5 points per can
          }
        });

        const calculatedMoney = calculateMoneyFromPoints(totalPoints);

        const updatedStats = {
          name: session.user.user_metadata?.name || 'Guest',
          points: totalPoints,
          money: calculatedMoney,
          bottles: totalBottles,
          cans: totalCans,
        };

        // Update users table
        const { data: userData, error: upsertError } = await supabase
          .from('users')
          .upsert([{
            id: userId,
            name: updatedStats.name,
            email: session.user.email,
            points: updatedStats.points,
            bottles: updatedStats.bottles,
            cans: updatedStats.cans,
            money: updatedStats.money,
            is_admin: false,
          }], { onConflict: 'id' })
          .select()
          .single();

        if (upsertError) {
          console.error('Profile upsert error:', upsertError);
          throw new Error('Failed to update user profile: ' + upsertError.message);
        }

        // Update localStorage
        localStorage.setItem('user', JSON.stringify({
          id: userId,
          email: session.user.email,
          name: updatedStats.name,
          points: updatedStats.points,
          money: updatedStats.money,
          bottles: updatedStats.bottles,
          cans: updatedStats.cans,
          is_admin: JSON.parse(localStorage.getItem('is_admin') || 'false'),
        }));

        setStats(updatedStats);
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