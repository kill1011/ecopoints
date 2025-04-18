import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRecycle, faStar, faUser, faList } from '@fortawesome/free-solid-svg-icons';
import '../styles/Dashboard.css';
import { supabase } from '../config/supabase';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    username: 'Guest',
    total_points: 0,
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

  useEffect(() => {
    let subscription;

    const fetchUserStats = async () => {
      try {
        // Authenticate user
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
        if (authError || !authUser) {
          throw new Error('Authentication required');
        }

        // Fetch user profile
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('username, total_points')
          .eq('id', authUser.id)
          .single();

        if (userError || !userData) {
          console.error('User query error:', userError);
          throw new Error('User profile not found');
        }

        // Fetch recyclables data
        const { data: detectionsData, error: detectionsError } = await supabase
          .from('recyclables')
          .select('material, quantity, points, created_at')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false });

        if (detectionsError) {
          console.error('Detections query error:', detectionsError);
          throw new Error(detectionsError.message);
        }

        // Aggregate bottles and cans
        let totalBottles = 0;
        let totalCans = 0;
        detectionsData.forEach((detection) => {
          if (detection.material.toLowerCase().includes('bottle')) {
            totalBottles += detection.quantity;
          } else if (detection.material.toLowerCase().includes('can')) {
            totalCans += detection.quantity;
          }
        });

        setStats({
          username: userData.username || 'Guest',
          total_points: userData.total_points || 0,
          bottles: totalBottles,
          cans: totalCans,
        });

        // Set recent detections (limit to 5)
        setRecentDetections(detectionsData.slice(0, 5));
        setError(null);

        // Subscribe to real-time recyclables changes
        subscription = supabase
          .channel('recyclables_changes')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'recyclables',
              filter: `user_id=eq.${authUser.id}`,
            },
            (payload) => {
              console.log('New detection:', payload);
              const detection = payload.new;
              setRecentDetections((prev) => [
                { ...detection },
                ...prev.slice(0, 4),
              ]);
              setStats((prev) => {
                const newBottles = detection.material.toLowerCase().includes('bottle')
                  ? prev.bottles + detection.quantity
                  : prev.bottles;
                const newCans = detection.material.toLowerCase().includes('can')
                  ? prev.cans + detection.quantity
                  : prev.cans;
                return {
                  ...prev,
                  bottles: newBottles,
                  cans: newCans,
                };
              });
            }
          )
          .subscribe((status, err) => {
            if (err || status === 'CLOSED') {
              console.error('Subscription error:', err || status);
              setError('Failed to subscribe to detections.');
            }
          });

        return () => {
          supabase.removeChannel(subscription);
        };
      } catch (error) {
        console.error('Error fetching user data:', error);
        setError(error.message);
        if (error.message.includes('Authentication')) {
          navigate('/login');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchUserStats();
  }, [navigate]);

  return (
    <div className="app-container">
      <Header userName={stats.username} toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
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
                <h1>{getGreeting()}, {stats.username}!</h1>
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-card" id="pointsCard">
                <FontAwesomeIcon icon={faRecycle} className="stat-icon" />
                <div className="stat-value">{stats.total_points.toLocaleString()}</div>
                <div className="stat-label">Total Points</div>
              </div>

              <div className="stat-card" id="bottlesCard">
                <FontAwesomeIcon icon={faStar} className="stat-icon" />
                <div className="stat-value">{stats.bottles.toLocaleString()}</div>
                <div className="stat-label">Bottles Recycled</div>
              </div>

              <div className="stat-card" id="cansCard">
                <FontAwesomeIcon icon={faStar} className="stat-icon" />
                <div className="stat-value">{stats.cans.toLocaleString()}</div>
                <div className="stat-label">Cans Recycled</div>
              </div>
            </div>

            <div className="detections-section">
              <h2>
                <FontAwesomeIcon icon={faList} /> Recent Materials Received
              </h2>
              {recentDetections.length > 0 ? (
                <ul className="detections-list">
                  {recentDetections.map((detection) => (
                    <li key={detection.created_at}>
                      {detection.material} (Qty: {detection.quantity}, Points: {detection.points}) -{' '}
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