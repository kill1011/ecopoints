import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faLock } from '@fortawesome/free-solid-svg-icons';
import { supabase } from '../config/supabase';
import '../styles/Login.css';

const LoginPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
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

        if (error) {
          if (error.message.includes('Invalid login')) {
            throw new Error('Incorrect email or password');
          }
          if (error.message.includes('Email not confirmed')) {
            throw new Error('Please confirm your email before logging in');
          }
          throw error;
        }

        // Check for user profile
        let { data: profile, error: profileError } = await supabase
          .from('users')
          .select('id, email, total_points')
          .eq('id', data.user.id)
          .single();

        if (profileError || !profile) {
          // Create profile if missing
          const { error: insertError } = await supabase
            .from('users')
            .insert({
              id: data.user.id,
              email: data.user.email,
              total_points: 0,
            });

          if (insertError) {
            console.error('Profile creation error:', insertError);
            throw new Error('Failed to create user profile');
          }

          // Fetch created profile
          const { data: newProfile, error: newProfileError } = await supabase
            .from('users')
            .select('id, email, total_points')
            .eq('id', data.user.id)
            .single();

          if (newProfileError || !newProfile) {
            throw new Error('Failed to retrieve new user profile');
          }
          profile = newProfile;
        }

        console.log('Login successful, user profile:', profile);

        localStorage.setItem('user', JSON.stringify({
          id: profile.id,
          email: profile.email,
          total_points: profile.total_points,
        }));

        navigate('/dashboard', { replace: true });
      } else {
        // Handle signup
        // Check if email exists in users
        const { data: existingUser, error: checkError } = await supabase
          .from('users')
          .select('id')
          .eq('email', formData.email)
          .single();

        if (existingUser) {
          throw new Error('Email already registered. Please log in.');
        }
        if (checkError && !checkError.message.includes('0 rows')) {
          throw checkError;
        }

        const { data, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
        });

        if (error) {
          if (error.message.includes('already registered')) {
            throw new Error('Email already registered. Please log in.');
          }
          throw error;
        }

        // Insert user profile
        const { error: profileError } = await supabase
          .from('users')
          .insert({
            id: data.user.id,
            email: data.user.email,
            total_points: 0,
          });

        if (profileError) {
          console.error('Profile insert error:', profileError);
          throw new Error('Failed to create user profile');
        }

        console.log('User account created, user:', data.user);

        if (data.session) {
          localStorage.setItem('user', JSON.stringify({
            id: data.user.id,
            email: data.user.email,
            total_points: 0,
          }));
          navigate('/dashboard', { replace: true });
        } else {
          setError('Account created! Please check your email to confirm, then log in.');
          setFormData({ email: '', password: '' });
        }
      }
    } catch (error) {
      console.error('Authentication error:', error);
      setError(error.message || 'Authentication failed');
      setFormData({ email: '', password: '' });
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
                setFormData({ email: '', password: '' });
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