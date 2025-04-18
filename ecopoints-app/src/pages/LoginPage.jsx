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

        console.log('Login auth successful, user:', data.user);

        // Fetch user profile
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('email', formData.email)
          .single();

        if (profileError) throw new Error(profileError.message || 'Error fetching profile');
        if (!profile) throw new Error('User profile not found');

        console.log('Login successful, user profile:', profile);

        // Store user data
        localStorage.setItem('token', data.session.access_token);
        localStorage.setItem('user', JSON.stringify(profile));
        localStorage.setItem('user_id', profile.id);
        localStorage.setItem('is_admin', profile.is_admin);

        // Redirect based on admin status
        if (profile.is_admin) {
          console.log('Admin user detected, redirecting to admin dashboard');
          navigate('/admin/admindashboard', { replace: true });
        } else {
          console.log('Regular user detected, redirecting to user dashboard');
          navigate('/dashboard', { replace: true });
        }
      } else {
        console.log('Testing table access...');
        const { data: test, error: testError } = await supabase.from('users').select('id').limit(1);
        console.log('Test Query:', {
          test,
          testError: testError ? {
            message: testError.message,
            code: testError.code,
            details: testError.details,
            timestamp: new Date().toISOString(),
          } : null,
        });

        console.log('Attempting signup with:', formData.email);

        // Call Edge Function with retries
        let signupData = null;
        let signupError = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          console.log(`Signup attempt ${attempt}...`);
          try {
            const startTime = Date.now();
            const response = await fetch('https://new-project-id.supabase.co/functions/v1/signup-user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: formData.email,
                password: formData.password,
                name: formData.name,
              }),
            });

            const result = await response.json();
            console.log('Signup request duration:', Date.now() - startTime, 'ms');

            if (!response.ok) {
              console.error('Signup response error:', result);
              signupError = { message: result.error || 'Failed to create account' };
              if (result.error?.includes('already registered')) {
                throw new Error('Email already registered. Please log in or use a different email.');
              }
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
              continue;
            }

            signupData = result;
            signupError = null;
            console.log('Signup Response:', {
              user: signupData.user,
              session: signupData.session ? {
                access_token: signupData.session.access_token?.slice(0, 10) + '...',
                expires_at: signupData.session.expires_at,
              } : null,
              attempt,
              timestamp: new Date().toISOString(),
            });
            break;
          } catch (networkError) {
            console.error('Network error during signup:', {
              message: networkError.message,
              stack: networkError.stack,
              attempt,
              timestamp: new Date().toISOString(),
            });
            signupError = { message: 'Network error: Failed to reach server' };
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
          }
        }

        if (signupError || !signupData?.user) {
          console.error('Signup Error:', signupError);
          throw new Error(signupError?.message || 'Failed to create account');
        }

        console.log('Signup successful, user:', signupData.user);

        // Verify profile
        const { data: profile, error: profileFetchError } = await supabase
          .from('users')
          .select('*')
          .eq('email', formData.email)
          .single();

        if (profileFetchError || !profile) {
          console.error('Profile fetch error:', profileFetchError);
          throw new Error(profileFetchError?.message || 'User profile not found after signup');
        }

        console.log('User profile retrieved:', profile);

        // Store user data
        localStorage.setItem('token', signupData.session.access_token);
        localStorage.setItem('user', JSON.stringify(profile));

        // Redirect based on admin status
        if (profile.is_admin) {
          console.log('Admin account created, redirecting to admin dashboard');
          navigate('/admin/admindashboard');
        } else {
          console.log('User account created, redirecting to dashboard');
          navigate('/dashboard');
        }
      }
    } catch (error) {
      console.error('Authentication error:', {
        message: error.message,
        code: error.code,
        status: error.status,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
      setError(error.message || 'Authentication failed. Please try again.');
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