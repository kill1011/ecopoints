import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faLock, faUser } from '@fortawesome/free-solid-svg-icons';
import { supabase } from '../config/supabase';
import '../styles/Login.css';

const LoginPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    gmail: '',
    password: '',
    username: '',
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
          email: formData.gmail,
          password: formData.password,
        });

        if (error) {
          if (error.message.includes('Invalid login')) {
            throw new Error('Incorrect Gmail or password');
          }
          if (error.message.includes('Email not confirmed')) {
            throw new Error('Please confirm your Gmail before logging in');
          }
          throw error;
        }

        // Fetch user profile (assumes profile exists due to trigger)
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('id, username, gmail, total_points')
          .eq('id', data.user.id)
          .single();

        if (profileError || !profile) {
          console.error('Profile fetch error:', profileError);
          throw new Error('User profile not found');
        }

        console.log('Login successful, user profile:', profile);

        // Store minimal user data (avoid sensitive info in localStorage)
        localStorage.setItem('user', JSON.stringify({
          id: profile.id,
          username: profile.username,
          total_points: profile.total_points,
        }));

        navigate('/dashboard', { replace: true });
      } else {
        // Handle signup
        // Validate username
        const trimmedUsername = formData.username.trim();
        if (!trimmedUsername) {
          throw new Error('Username cannot be empty');
        }

        // Check if gmail exists
        const { data: existingGmail, error: gmailError } = await supabase
          .from('users')
          .select('id')
          .eq('gmail', formData.gmail);

        if (gmailError) {
          console.error('Gmail check error:', gmailError);
          throw new Error('Failed to check Gmail availability');
        }
        if (existingGmail && existingGmail.length > 0) {
          throw new Error('Gmail already registered. Please log in.');
        }

        // Check if username exists
        const { data: existingUsername, error: usernameError } = await supabase
          .from('users')
          .select('id')
          .eq('username', trimmedUsername);

        if (usernameError) {
          console.error('Username check error:', usernameError);
          throw new Error('Failed to check username availability');
        }
        if (existingUsername && existingUsername.length > 0) {
          throw new Error('Username already taken. Please choose another.');
        }

        // Sign up user
        const { data, error } = await supabase.auth.signUp({
          email: formData.gmail,
          password: formData.password,
        });

        if (error) {
          if (error.message.includes('already registered')) {
            throw new Error('Gmail already registered. Please log in.');
          }
          throw error;
        }

        console.log('User account created, user:', data.user);

        if (data.session) {
          // Auto-login after signup (if email confirmation is disabled)
          localStorage.setItem('user', JSON.stringify({
            id: data.user.id,
            username: trimmedUsername,
            total_points: 0,
          }));
          navigate('/dashboard', { replace: true });
        } else {
          // Email confirmation required
          setError('Account created! Please check your Gmail to confirm, then log in.');
          setFormData({ gmail: '', password: '', username: '' });
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
                  name="username"
                  required
                  placeholder="Username"
                  value={formData.username}
                  onChange={handleChange}
                  className="form-input"
                />
                <FontAwesomeIcon icon={faUser} className="input-icon" />
              </div>
            )}

            <div className="input-group">
              <input
                type="email"
                name="gmail"
                required
                placeholder="Gmail address"
                value={formData.gmail}
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
                setFormData({ gmail: '', password: '', username: '' });
              }}
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