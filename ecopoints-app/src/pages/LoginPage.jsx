import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faLock, faUser } from '@fortawesome/free-solid-svg-icons';
import { supabase } from '../config/supabase';
import '../styles/Login.css';

const LoginPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Trim and validate inputs
      const email = formData.email.trim();
      const password = formData.password.trim();
      const name = formData.name.trim();

      if (!email || !password) {
        throw new Error('Email and password are required');
      }

      if (!isLogin && !name) {
        throw new Error('Name is required for signup');
      }

      if (isLogin) {
        // Handle login
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          if (error.status === 400 && error.message.includes('invalid credentials')) {
            throw new Error('Invalid email or password. Please try again.');
          }
          if (error.message.includes('email not confirmed')) {
            throw new Error('Please verify your email before logging in.');
          }
          throw new Error(error.message || 'Failed to sign in. Please try again.');
        }

        if (!data.user) {
          throw new Error('No user data returned after authentication');
        }

        // Get user profile from users table
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('id, email, name, is_admin')
          .eq('id', data.user.id)
          .single();

        if (profileError) {
          console.error('Profile fetch error:', profileError);
          throw new Error('Failed to fetch user profile: ' + profileError.message);
        }

        if (!profile) {
          throw new Error('User profile not found in users table');
        }

        // Fetch user stats from user_stats table
        const { data: stats, error: statsError } = await supabase
          .from('user_stats')
          .select('total_points, total_money, total_bottle_count, total_can_count')
          .eq('user_id', data.user.id)
          .single();

        if (statsError) {
          console.error('Stats fetch error:', statsError);
          if (statsError.code !== 'PGRST116') {
            throw new Error('Failed to fetch user stats: ' + statsError.message);
          }
        }

        const userProfile = {
          id: profile.id,
          email: profile.email,
          name: profile.name || 'Unknown',
          is_admin: profile.is_admin || false,
          points: stats?.total_points || 0,
          money: stats?.total_money || 0,
          bottles: stats?.total_bottle_count || 0,
          cans: stats?.total_can_count || 0,
        };

        console.log('Login successful, user profile:', userProfile);

        // Store user data in localStorage
        localStorage.setItem('token', data.session.access_token);
        localStorage.setItem('user', JSON.stringify(userProfile));
        localStorage.setItem('user_id', profile.id);
        localStorage.setItem('is_admin', profile.is_admin.toString());

        // Redirect based on admin status
        if (profile.is_admin) {
          console.log('Admin user detected, redirecting to admin dashboard');
          navigate('/admin/admindashboard', { replace: true });
        } else {
          console.log('Regular user detected, redirecting to user dashboard');
          navigate('/dashboard', { replace: true });
        }
      } else {
        // Handle signup
        // Proceed with signup directly (removed check_user_exists RPC call)
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name },
          },
        });

        if (error) {
          if (error.message.includes('already registered')) {
            throw new Error('This email is already registered. Please sign in instead.');
          }
          if (error.message.includes('email not confirmed')) {
            throw new Error('Please verify your email after signing up.');
          }
          throw new Error(error.message || 'Failed to sign up. Please try again.');
        }

        if (!data.user) {
          throw new Error('No user data returned after signup');
        }

        // Check if this is an admin email
        const isAdmin = email.endsWith('PCCECOPOINTS@ecopoints.com');

        // Create user profile in users table
        const { error: profileError } = await supabase
          .from('users')
          .insert([
            {
              id: data.user.id,
              email,
              name,
              is_admin: isAdmin,
            },
          ]);

        if (profileError) {
          console.error('Profile insert error:', profileError);
          throw new Error('Failed to create user profile: ' + profileError.message);
        }

        // Initialize user stats in user_stats table
        const { error: statsError } = await supabase
          .from('user_stats')
          .insert([
            {
              user_id: data.user.id,
              total_points: 0,
              total_money: 0,
              total_bottle_count: 0,
              total_can_count: 0,
            },
          ]);

        if (statsError) {
          console.error('Stats insert error:', statsError);
          throw new Error('Failed to initialize user stats: ' + statsError.message);
        }

        // Handle email confirmation case
        if (data.session) {
          const userProfile = {
            id: data.user.id,
            email,
            name,
            is_admin: isAdmin,
            points: 0,
            money: 0,
            bottles: 0,
            cans: 0,
          };

          localStorage.setItem('token', data.session.access_token);
          localStorage.setItem('user', JSON.stringify(userProfile));
          localStorage.setItem('user_id', data.user.id);
          localStorage.setItem('is_admin', isAdmin.toString());

          if (isAdmin) {
            console.log('Admin account created, redirecting to admin dashboard');
            navigate('/admin/admindashboard', { replace: true });
          } else {
            console.log('User account created, redirecting to dashboard');
            navigate('/dashboard', { replace: true });
          }
        } else {
          setError('Account created! Please check your email to verify your account.');
        }
      }
    } catch (error) {
      console.error('Authentication error:', error);
      setError(error.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <>
      <header className="app-header">
        <h1>EcoPoints</h1>
      </header>
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>{isLogin ? 'Welcome Back!' : 'Join EcoPoints'}</h1>
            <p>{isLogin ? 'Sign in to continue' : 'Create your account'}</p>
          </div>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit}>
            {!isLogin && (
              <div className="input-group">
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Full Name"
                  value={formData.name}
                  onChange={handleChange}
                  className="form-input"
                />
                <FontAwesomeIcon icon={faUser} className="input-icon" />
              </div>
            )}

            <div className="input-group">
              <input
                type="email"
                name="email"
                required
                placeholder="Email address"
                value={formData.email}
                onChange={handleChange}
                className="form-input"
              />
              <FontAwesomeIcon icon={faEnvelope} className="input-icon" />
            </div>

            <div className="input-group">
              <input
                type="password"
                name="password"
                required
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
                className="form-input"
              />
              <FontAwesomeIcon icon={faLock} className="input-icon" />
            </div>

            <button type="submit" className="submit-button" disabled={loading}>
              {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="toggle-auth">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setFormData({ email: '', password: '', name: '' });
              }}
              disabled={loading}
            >
              {isLogin ? 'New to EcoPoints? Create an account' : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginPage;