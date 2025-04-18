import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faExchangeAlt, faUser, faList } from '@fortawesome/free-solid-svg-icons';
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
  const [recentDetections, setRecentDetections] = useState([]);
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
          setError('Authentication required');
          console.log('No session, redirecting to login');
          navigate('/login');
          return;
        }

        console.log('User ID:', session.user.id);
        console.log('User Metadata:', session.user.user_metadata);

        // Fetch user data
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, name, email, points, bottles, cans')
          .eq('id', session.user.id)
          .limit(1)
          .maybeSingle();

        if (userError) {
          console.error('User Query Error:', userError);
          throw new Error(userError.message || 'Failed to fetch user data');
        }

        if (!userData) {
          console.log('No user data found, creating default profile...');
          const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert([{
              id: session.user.id,
              name: session.user.user_metadata?.name || 'Guest',
              email: session.user.email || 'guest@example.com',
              points: 0,
              bottles: 0,
              cans: 0,
            }])
            .select()
            .single();

          if (createError) {
            console.error('Create User Error:', createError);
            throw new Error(createError.message || 'Failed to create user profile');
          }

          setStats({
            name: newUser.name,
            points: 0,
            money: 0,
            bottles: 0,
            cans: 0,
          });
        } else {
          const calculatedMoney = calculateMoneyFromPoints(userData.points || 0);
          setStats({
            name: userData.name || 'Guest',
            points: Number(userData.points) || 0,
            money: calculatedMoney,
            bottles: Number(userData.bottles) || 0,
            cans: Number(userData.cans) || 0,
          });
        }

        // Fetch recent transactions for the user
        const { data: transactionsData, error: transactionsError } = await supabase
          .from('recyclable_transactions')
          .select('type, quantity, points, money, created_at')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (transactionsError) {
          console.error('Transactions Query Error:', transactionsError);
          throw new Error(transactionsError.message || 'Failed to fetch recent transactions');
        }

        setRecentDetections(transactionsData || []);
        setError(null);
      } catch (error) {
        console.error('Error fetching user data:', error);
        setError(
          error.message.includes('permission')
            ? 'Access denied. Please contact support.'
            : 'Error loading user data. Please try again.'
        );
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

            <div className="detections-section">
              <h2>
                <FontAwesomeIcon icon={faList} /> Recent Transactions
              </h2>
              {recentDetections.length > 0 ? (
                <ul className="detections-list">
                  {recentDetections.map((transaction) => (
                    <li key={transaction.created_at}>
                      {transaction.type} (Qty: {transaction.quantity}) - Points: {transaction.points}, Value: ₱{transaction.money.toFixed(2)} -{' '}
                      {new Date(transaction.created_at).toLocaleString()}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No recent transactions.</p>
              )}
            </div>
          </main>
        )}
      </div>
    </div>
  );
};

export default Dashboard;