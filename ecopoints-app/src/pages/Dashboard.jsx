import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faExchangeAlt, faHistory, faUser, faList } from '@fortawesome/free-solid-svg-icons';
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

  const calculatePointsAndMoney = (material, quantity) => {
    const pointsPerItem = 10; // Same as in Insert.jsx
    const moneyPerItem = 0.05; // Same as in Insert.jsx
    const totalPoints = quantity * pointsPerItem;
    const totalMoney = quantity * moneyPerItem;
    return { points: totalPoints, money: totalMoney };
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

        // Fetch user data
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('points, money, name, bottles, cans')
          .eq('id', session.user.id)
          .limit(1)
          .maybeSingle();

        if (userError) {
          console.error('Database Error:', userError);
          throw new Error(userError.message);
        }

        if (!userData) {
          console.log('No user data found, creating default profile...');
          const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert([{
              id: session.user.id,
              name: session.user.user_metadata?.name || 'Guest',
              points: 0,
              money: 0,
              bottles: 0,
              cans: 0,
            }])
            .select()
            .single();

          if (createError) throw createError;

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

        // Fetch recent detections from recyclables table
        const { data: detectionsData, error: detectionsError } = await supabase
          .from('recyclables')
          .select('material, quantity, created_at')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (detectionsError) throw detectionsError;

        const enrichedDetections = detectionsData.map(detection => ({
          ...detection,
          ...calculatePointsAndMoney(detection.material, detection.quantity),
        }));

        setRecentDetections(enrichedDetections);
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

            {/* New Section for Recent Detections */}
            <div className="detections-section">
              <h2>
                <FontAwesomeIcon icon={faList} /> Recent Materials Received
              </h2>
              {recentDetections.length > 0 ? (
                <ul className="detections-list">
                  {recentDetections.map((detection) => (
                    <li key={detection.created_at}>
                      {detection.material} ({detection.quantity}) - Points: {detection.points}, Value: ₱{detection.money.toFixed(2)} -{' '}
                      {new Date(detection.created_at).toLocaleString()}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No recent materials received.</p>
              )}
            </div>
          </main>
        )}
      </div>
    </div>
  );
};

export default Dashboard;