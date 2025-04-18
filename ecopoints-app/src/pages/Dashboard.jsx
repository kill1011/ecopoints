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

  const calculatePointsAndMoney = (material, quantity) => {
    const pointsPerItem = 10; // 1 item = 10 points
    const moneyPerItem = 0.10; // 1 item = 0.10 pesos (10 points = 0.10 pesos)
    const totalPoints = quantity * pointsPerItem;
    const totalMoney = quantity * moneyPerItem;
    return { points: totalPoints, money: totalMoney };
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

        const userId = session.user.id;
        console.log('User ID:', userId);

        // Fetch user data
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('points, money, name, bottles, cans')
          .eq('id', userId)
          .limit(1)
          .maybeSingle();

        if (userError) {
          console.error('User Query Error:', userError);
          throw new Error(userError.message);
        }

        if (!userData) {
          console.log('No user data found, creating default profile...');
          const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert([{
              id: userId,
              name: session.user.user_metadata?.name || 'Guest',
              email: session.user.email || 'guest@example.com',
              points: 0,
              money: 0,
              bottles: 0,
              cans: 0,
            }])
            .select()
            .single();

          if (createError) {
            console.error('Create User Error:', createError);
            throw createError;
          }

          setStats({
            name: newUser.name,
            points: 0,
            money: 0,
            bottles: 0,
            cans: 0,
          });
        } else {
          setStats({
            name: userData.name || 'Guest',
            points: Number(userData.points) || 0,
            money: Number(userData.money) || 0,
            bottles: Number(userData.bottles) || 0,
            cans: Number(userData.cans) || 0,
          });
        }

        // Fetch and aggregate recyclables data
        const { data: detectionsData, error: detectionsError } = await supabase
          .from('recyclables')
          .select('material, quantity, created_at')
          .eq('device_id', 'esp32-cam-1')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (detectionsError) {
          console.error('Detections Query Error:', detectionsError);
          throw detectionsError;
        }

        // Aggregate bottles, cans, points, money
        let totalBottles = 0;
        let totalCans = 0;
        let totalPoints = 0;
        let totalMoney = 0;

        const enrichedDetections = detectionsData.map(detection => {
          const { points, money } = calculatePointsAndMoney(detection.material, detection.quantity);
          if (detection.material.toLowerCase().includes('bottle')) {
            totalBottles += detection.quantity;
          } else if (detection.material.toLowerCase().includes('can')) {
            totalCans += detection.quantity;
          }
          totalPoints += points;
          totalMoney += money;
          return { ...detection, points, money };
        });

        // Update users table if stats differ
        if (
          totalBottles !== stats.bottles ||
          totalCans !== stats.cans ||
          totalPoints !== stats.points ||
          totalMoney !== stats.money
        ) {
          const { error: updateError } = await supabase
            .from('users')
            .update({
              bottles: totalBottles,
              cans: totalCans,
              points: totalPoints,
              money: totalMoney,
            })
            .eq('id', userId);

          if (updateError) {
            console.error('Update User Error:', updateError);
            throw updateError;
          }

          setStats(prev => ({
            ...prev,
            bottles: totalBottles,
            cans: totalCans,
            points: totalPoints,
            money: totalMoney,
          }));
        }

        // Set recent detections (limit to 5)
        setRecentDetections(enrichedDetections.slice(0, 5));
        setError(null);

        // Subscribe to real-time recyclables changes
        const subscription = supabase
          .channel('recyclables_changes')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'recyclables',
              filter: `device_id=eq.esp32-cam-1&user_id=eq.${userId}`,
            },
            (payload) => {
              console.log('New detection:', payload);
              const { new: detection } = payload;
              const { points, money } = calculatePointsAndMoney(detection.material, detection.quantity);
              setRecentDetections(prev => {
                const updated = [{ ...detection, points, money }, ...prev.slice(0, 4)];
                console.log('Updated detections:', updated);
                return updated;
              });
              setStats(prev => {
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
                  points: prev.points + points,
                  money: prev.money + money,
                };
              });
            }
          )
          .subscribe((status) => {
            console.log('Subscription status:', status);
          });

        return () => {
          console.log('Cleaning up subscription');
          supabase.removeChannel(subscription);
        };
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