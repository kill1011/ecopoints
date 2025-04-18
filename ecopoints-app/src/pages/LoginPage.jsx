import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faLock, faUser, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';
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
  const [user, setUser] = useState(null); // Track logged-in user
  const navigate = useNavigate();

  // Sync with Supabase session on mount
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (error || !profile) {
          console.error('Profile fetch error:', error);
          setError('User profile not found');
          return;
        }

        setUser(profile);
        localStorage.setItem('user', JSON.stringify({
          id: profile.id,
          name: profile.name,
          email: profile.email,
          points: profile.points,
          is_admin: profile.is_admin,
        }));
        localStorage.setItem('token', session.access_token);
        localStorage.setItem('user_id', profile.id);
        localStorage.setItem('is_admin', profile.is_admin.toString());
      }
    };

    checkSession();

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        checkSession();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('user_id');
        localStorage.removeItem('is_admin');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (isLogin) {
        // Handle login
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (error) throw error;

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', data.user.id)
          .single();

        if (profileError || !profile) throw new Error('User profile not found');

        console.log('Login successful, user profile:', profile);

        localStorage.setItem('user', JSON.stringify({
          id: profile.id,
          name: profile.name,
          email: profile.email,
          points: profile.points,
          is_admin: profile.is_admin,
        }));
        localStorage.setItem('token', data.session.access_token);
        localStorage.setItem('user_id', profile.id);
        localStorage.setItem('is_admin', profile.is_admin.toString());

        setUser(profile);

        if (profile.is_admin) {
          console.log('Admin user detected, redirecting to admin dashboard');
          navigate('/admin', { replace: true });
        } else {
          console.log('Regular user detected, redirecting to user dashboard');
          navigate('/dashboard', { replace: true });
        }
      } else {
        // Handle signup
        const { data, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: { name: formData.name },
          },
        });

        if (error) throw error;

        const isAdmin = formData.email.endsWith('PCCECOPOINTS@ecopoints.com');

        const { error: profileError } = await supabase
          .from('users')
          .insert([
            {
              id: data.user.id,
              email: formData.email,
              name: formData.name,
              points: 0,
              money: 0,
              is_admin: isAdmin,
            },
          ]);

        if (profileError) throw profileError;

        const { data: profile, error: fetchError } = await supabase
          .from('users')
          .select('*')
          .eq('id', data.user.id)
          .single();

        if (fetchError || !profile) throw new Error('Failed to fetch new user profile');

        console.log('Signup successful, user profile:', profile);

        localStorage.setItem('user', JSON.stringify({
          id: profile.id,
          name: profile.name,
          email: profile.email,
          points: profile.points,
          is_admin: profile.is_admin,
        }));
        if (data.session) {
          localStorage.setItem('token', data.session.access_token);
          localStorage.setItem('user_id', profile.id);
          localStorage.setItem('is_admin', profile.is_admin.toString());
        }

        setUser(profile);

        if (isAdmin) {
          console.log('Admin account created, redirecting to admin dashboard');
          navigate('/admin', { replace: true });
        } else {
          console.log('User account created, redirecting to dashboard');
          navigate('/dashboard', { replace: true });
        }
      }
    } catch (error) {
      console.error('Authentication error:', error);
      setError(error.message || 'Authentication failed');
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('user_id');
      localStorage.removeItem('is_admin');
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Logout error:', error);
      setError('Failed to log out');
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
          {user ? (
            <div className="logged-in">
              <h1>Welcome, {user.name}!</h1>
              <p>You are logged in.</p>
              <button onClick={handleLogout} className="logout-button">
                <FontAwesomeIcon icon={faSignOutAlt} /> Log Out
              </button>
            </div>
          ) : (
            <>
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

                <button type="submit" className="submit-button">
                  {isLogin ? 'Sign In' : 'Create Account'}
                </button>
              </form>

              <div className="toggle-auth">
                <button
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setError('');
                    setFormData({ email: '', password: '', name: '' });
                  }}
                >
                  {isLogin ? 'New to EcoPoints? Create an account' : 'Already have an account? Sign in'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default LoginPage;