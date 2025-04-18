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
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchProfile = async (userId, retries = 3, retryDelay = 1000) => {
    for (let i = 0; i < retries; i++) {
      console.log(`Attempt ${i + 1} to fetch profile for user ID: ${userId}`);
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, email, name, is_admin')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.error('Profile Fetch Error:', {
          message: profileError.message,
          code: profileError.code,
          details: profileError.details,
          hint: profileError.hint,
        });
        throw new Error(profileError.message || 'Failed to fetch user profile');
      }

      if (profile) {
        console.log('Profile fetched successfully:', profile);
        return profile;
      }

      console.log('Profile not found, retrying after delay...');
      await delay(retryDelay);
    }
    throw new Error('User profile not created after retries. Please contact support.');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isLogin) {
        console.log('Attempting login with:', formData.email);
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (error) throw new Error(error.message || 'Invalid email or password');

        const profile = await fetchProfile(data.user.id);

        console.log('Login successful, user profile:', profile);

        localStorage.setItem('token', data.session.access_token);
        localStorage.setItem('user', JSON.stringify(profile));
        localStorage.setItem('user_id', profile.id);
        localStorage.setItem('is_admin', profile.is_admin.toString());

        if (profile.is_admin) {
          navigate('/admin', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      } else {
        console.log('Testing table access...');
        const { data: test, error: testError } = await supabase.from('users').select('id').limit(1);
        console.log('Test Query:', { test, testError });

        console.log('Attempting signup with:', formData.email);
        const { data, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: { name: formData.name },
            emailRedirectTo: window.location.origin + '/dashboard',
          },
        });

        console.log('SignUp Response:', { user: data.user, session: data.session, error });
        if (error) {
          console.error('SignUp Error:', error);
          throw new Error(error.message || 'Failed to create account');
        }
        if (!data.user) {
          throw new Error('Failed to create user account. Please try again.');
        }

        // Wait for trigger to complete
        await delay(1000);

        const profile = await fetchProfile(data.user.id);

        if (data.session) {
          localStorage.setItem('token', data.session.access_token);
          localStorage.setItem('user', JSON.stringify(profile));
          localStorage.setItem('user_id', profile.id);
          localStorage.setItem('is_admin', profile.is_admin.toString());

          if (profile.is_admin) {
            navigate('/admin', { replace: true });
          } else {
            navigate('/dashboard', { replace: true });
          }
        } else {
          setError('Account created successfully. Please log in.');
          setIsLogin(true);
          setFormData({ email: formData.email, password: '', name: '' });
        }
      }
    } catch (error) {
      console.error('Authentication error:', error);
      setError(error.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
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

            <button type="submit" className="submit-button" disabled={isLoading}>
              {isLoading ? 'Processing...' : isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="toggle-auth">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setFormData({ email: '', password: '', name: '' });
              }}
              disabled={isLoading}
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