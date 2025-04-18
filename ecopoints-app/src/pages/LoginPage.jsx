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
          } : null,
        });

        console.log('Attempting signup with:', formData.email);
        let signupData = null;
        let signupError = null;

        // Retry signup up to 3 times
        for (let attempt = 1; attempt <= 3; attempt++) {
          console.log(`Signup attempt ${attempt}...`);
          try {
            const startTime = Date.now();
            const { data, error } = await supabase.auth.signUp({
              email: formData.email,
              password: formData.password,
              options: {
                data: { name: formData.name },
              },
            });

            console.log('Signup request duration:', Date.now() - startTime, 'ms');

            signupData = data;
            signupError = error;

            console.log('SignUp Response:', {
              user: data?.user ? {
                id: data.user.id,
                email: data.user.email,
                created_at: data.user.created_at,
              } : null,
              session: data?.session ? {
                access_token: data.session.access_token?.slice(0, 10) + '...',
                expires_at: data.session.expires_at,
              } : null,
              error: error ? {
                message: error.message,
                code: error.code,
                status: error.status,
                details: error.details,
              } : null,
              attempt,
              timestamp: new Date().toISOString(),
            });

            if (!error) break;
            if (error.message.includes('already registered')) {
              throw new Error('Email already registered. Please log in or use a different email.');
            }
          } catch (networkError) {
            console.error('Network error during signup:', {
              message: networkError.message,
              stack: networkError.stack,
              attempt,
              timestamp: new Date().toISOString(),
            });
            signupError = { message: 'Network error: Failed to reach server' };
          }
          await delay(2000); // Wait 2s before retry
        }

        if (signupError) {
          console.error('SignUp Error:', signupError);
          throw new Error(signupError.message || 'Failed to create account');
        }
        if (!signupData.user) {
          throw new Error('Failed to create user account. Please try again.');
        }

        console.log('Signup auth successful, user:', signupData.user);

        // Insert user profile
        const isAdmin = formData.email.endsWith('PCCECOPOINTS@ecopoints.com');
        const { error: profileError } = await supabase
          .from('users')
          .insert([
            {
              id: signupData.user.id,
              email: formData.email,
              name: formData.name,
              points: 0,
              money: 0,
              is_admin: isAdmin,
            },
          ]);

        if (profileError) {
          console.error('Profile insert error:', profileError);
          throw new Error(profileError.message || 'Failed to create user profile');
        }

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

        console.log('User profile created:', profile);

        // Store user data
        localStorage.setItem('token', signupData.session?.access_token);
        localStorage.setItem('user', JSON.stringify(profile));

        // Redirect based on admin status
        if (isAdmin) {
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