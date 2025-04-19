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
  const navigate = useNavigate();

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

          // Get user profile from users table with better error handling
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('email', formData.email)
          .single();

        if (profileError) throw profileError;

        if (!profile) {
          throw new Error('User profile not found');
        }

        console.log('Login successful, user profile:', profile);

        // Store user data in localStorage
        localStorage.setItem('token', data.session.access_token);
        localStorage.setItem('user', JSON.stringify(profile));
        localStorage.setItem('user_id', profile.id);
        localStorage.setItem('is_admin', profile.is_admin);

        // Check if user is admin and redirect accordingly
        if (profile.is_admin) {
          console.log('Admin user detected, redirecting to admin dashboard');
          navigate('/admin/admindashboard', { replace: true }); // Changed from /admin/dashboard
        } else {
          console.log('Regular user detected, redirecting to user dashboard');
          navigate('/dashboard', { replace: true });
        }
      } else {
        try {
          // Handle signup
          const { data, error } = await supabase.auth.signUp({
            email: formData.email,
            password: formData.password,
            options: {
              data: {
                name: formData.name,
              }
            },
          });

          if (error) throw error;

          // Check if this is an admin email domain
          const isAdmin = formData.email.endsWith('PCCECOPOINTS@ecopoints.com');

          // Create user profile with better error handling
          const { error: profileError } = await supabase
            .from('users')
            .insert([
              {
                id: data.user.id,
                email: formData.email,
                name: formData.name,
                points: 0,
                money: 0,
                is_admin: isAdmin, // Set admin status based on email
              },
            ]);

          // Check if data exists and redirect accordingly
          const { data: checkData } = await supabase
            .from('users')
            .select()
            .eq('email', formData.email)
            .single();

          if (checkData) {
            localStorage.setItem('token', data.session?.access_token);
            localStorage.setItem('user', JSON.stringify(checkData));
            
            if (isAdmin) {
              console.log('Admin account created, redirecting to admin dashboard');
              navigate('/admin/dashboard');
            } else {
              console.log('User account created, redirecting to dashboard');
              navigate('/dashboard');
            }
          } else if (profileError) {
            throw profileError;
          }
        } catch (error) {
          console.error('Authentication error:', error);
          setError(error.message || 'Authentication failed');
        }
      }
    } catch (error) {
      console.error('Authentication error:', error);
      setError(error.message || 'Authentication failed');
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

            <button type="submit" className="submit-button">
              {isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="toggle-auth">
            <button onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setFormData({ email: '', password: '', name: '' });
            }}>
              {isLogin ? 'New to EcoPoints? Create an account' : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginPage;