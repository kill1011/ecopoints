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
        console.log('Attempting login with:', formData.email);
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (error) throw new Error(error.message || 'Invalid email or password');

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('id, email, name, points, bottles, cans, is_admin')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profileError) {
          console.error('Profile Fetch Error:', profileError);
          throw new Error(profileError.message || 'Failed to fetch user profile');
        }
        if (!profile) throw new Error('User profile not found. Please sign up.');

        console.log('Login successful, user profile:', profile);

        localStorage.setItem('token', data.session.access_token);
        localStorage.setItem('user', JSON.stringify(profile));
        localStorage.setItem('user_id', profile.id);
        localStorage.setItem('is_admin', profile.is_admin.toString());

        if (profile.is_admin) {
          console.log('Admin user detected, redirecting to admin dashboard');
          navigate('/admin', { replace: true });
        } else {
          console.log('Regular user detected, redirecting to user dashboard');
          navigate('/dashboard', { replace: true });
        }
      } else {
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

        const isAdmin = formData.email.endsWith('PCCECOPOINTS@ecopoints.com');
        
        // Insert the new user into the users table
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            id: data.user.id,
            email: formData.email,
            name: formData.name,
            points: 0,
            bottles: 0,
            cans: 0,
            is_admin: isAdmin
          });
          
        if (insertError) {
          console.error('Database error saving new user:', insertError);
          throw new Error('Database error saving new user. Please try again.');
        }

        if (data.session) {
          localStorage.setItem('token', data.session.access_token);
          localStorage.setItem('user', JSON.stringify({
            id: data.user.id,
            email: formData.email,
            name: formData.name,
            points: 0,
            bottles: 0,
            cans: 0,
            is_admin: isAdmin,
          }));
          localStorage.setItem('user_id', data.user.id);
          localStorage.setItem('is_admin', isAdmin.toString());
          
          if (isAdmin) {
            console.log('Admin account created, redirecting to admin dashboard');
            navigate('/admin', { replace: true });
          } else {
            console.log('User account created, redirecting to dashboard');
            navigate('/dashboard', { replace: true });
          }
        } else {
          // If using email confirmation flow, show appropriate message
          setError('Account created successfully. Please check your email for verification.');
          setIsLogin(true);
          setFormData({ email: formData.email, password: '', name: '' });
          return;
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
        </div>
      </div>
    </>
  );
};

export default LoginPage;