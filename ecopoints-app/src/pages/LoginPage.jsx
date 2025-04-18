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

        console.log('Login successful, user:', data.user);
        localStorage.setItem('token', data.session.access_token);
        localStorage.setItem('user_id', data.user.id);
        navigate('/dashboard', { replace: true });
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
        let signupError = null;
        let signupData = null;

        // Retry signup up to 3 times
        for (let attempt = 1; attempt <= 3; attempt++) {
          console.log(`Signup attempt ${attempt}...`);
          const { data, error } = await supabase.auth.signUp({
            email: formData.email,
            password: formData.password,
            options: {
              data: { name: formData.name },
            },
          });

          signupData = data;
          signupError = error;

          console.log('SignUp Response:', {
            user: data?.user,
            session: data?.session,
            error: error ? {
              message: error.message,
              code: error.code,
              status: error.status,
              details: error.details,
            } : null,
            attempt,
          });

          if (!error) break; // Success
          if (error.message.includes('already registered')) {
            throw new Error('Email already registered. Please log in or use a different email.');
          }
          await delay(1000); // Wait 1s before retry
        }

        if (signupError) {
          console.error('SignUp Error:', signupError);
          throw new Error(signupError.message || 'Failed to create account');
        }
        if (!signupData.user) {
          throw new Error('Failed to create user account. Please try again.');
        }

        console.log('User created:', signupData.user);
        setError('Account created successfully. Please log in.');
        setIsLogin(true);
        setFormData({ email: formData.email, password: '', name: '' });
      }
    } catch (error) {
      console.error('Authentication error:', {
        message: error.message,
        code: error.code,
        status: error.status,
        stack: error.stack,
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