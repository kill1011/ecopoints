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
          throw new Error('Login failed: ' + error.message);
        }

        // Check for user profile
        let { data: profile, error: profileError } = await supabase
          .from('users')
          .select('id, username, gmail, total_points')
          .eq('id', data.user.id)
          .single();

        if (profileError && !profileError.message.includes('0 rows')) {
          console.error('Profile fetch error:', profileError);
          throw new Error('Failed to fetch user profile');
        }

        if (!profile) {
          // Create profile if missing
          const defaultUsername = data.user.email.split('@')[0];
          // Check for duplicate username
          const { data: existingUsername, error: usernameError } = await supabase
            .from('users')
            .select('id')
            .eq('username', defaultUsername);

          if (usernameError) {
            console.error('Username check error:', usernameError);
            throw new Error('Failed to check username availability');
          }
          if (existingUsername && existingUsername.length > 0) {
            // Append timestamp to avoid duplicates
            const timestamp = Date.now();
            defaultUsername = `${defaultUsername}_${timestamp}`;
          }

          const { error: insertError } = await supabase
            .from('users')
            .insert({
              id: data.user.id,
              username: defaultUsername,
              gmail: data.user.email,
              total_points: 0,
            });

          if (insertError) {
            console.error('Profile creation error:', insertError);
            if (insertError.code === '23503') {
              throw new Error('Profile creation failed: User not found in authentication system');
            }
            if (insertError.code === '23505') {
              throw new Error('Profile creation failed: Username or Gmail already exists');
            }
            if (insertError.code === '42501') {
              throw new Error('Profile creation failed: Insufficient permissions');
            }
            throw new Error('Failed to create user profile: ' + insertError.message);
          }

          // Fetch created profile
          const { data: newProfile, error: newProfileError } = await supabase
            .from('users')
            .select('id, username, gmail, total_points')
            .eq('id', data.user.id)
            .single();

          if (newProfileError || !newProfile) {
            console.error('New profile fetch error:', newProfileError);
            throw new Error('Failed to retrieve new user profile');
          }
          profile = newProfile;
        }

        console.log('Login successful, user profile:', profile);

        localStorage.setItem('user', JSON.stringify({
          id: profile.id,
          username: profile.username,
          total_points: profile.total_points,
        }));

        navigate('/dashboard', { replace: true });
      } else {
        // Handle signup
        const trimmedUsername = formData.username.trim();
        if (!trimmedUsername) {
          throw new Error('Username cannot be empty');
        }

        // Check if gmail or username exists
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

        const { data, error } = await supabase.auth.signUp({
          email: formData.gmail,
          password: formData.password,
          options: {
            data: { username: trimmedUsername },
          },
        });

        if (error) {
          if (error.message.includes('already registered')) {
            throw new Error('Gmail already registered. Please log in.');
          }
          throw new Error('Signup failed: ' + error.message);
        }

        // Profile is created by trigger, no need to insert here
        console.log('User account created, user:', data.user);

        if (data.session) {
          localStorage.setItem('user', JSON.stringify({
            id: data.user.id,
            username: trimmedUsername,
            total_points: 0,
          }));
          navigate('/dashboard', { replace: true });
        } else {
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
          <div class="login-header">
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