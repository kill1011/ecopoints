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
        // LOGIN LOGIC
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
        // SIGNUP LOGIC - APPROACH 2: DIRECTLY USE SQL RPC
        console.log('Attempting signup with:', formData.email);
        
        // 1. First, create the auth user
        const { data, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: { name: formData.name }
          },
        });
        
        if (error) {
          console.error('SignUp Error:', error);
          throw new Error(error.message || 'Failed to create account');
        }
        
        if (!data.user) {
          console.error('User creation failed - no user returned');
          throw new Error('Failed to create user account. Please try again.');
        }
        
        console.log('Auth user created successfully with ID:', data.user.id);
        
        // 2. Instead of using .insert(), try a custom function call or direct RPC
        // This is a workaround approach that might bypass whatever is causing the issue
        const isAdmin = formData.email.endsWith('PCCECOPOINTS@ecopoints.com');
        
        // Try different approaches one after another
        
        // APPROACH A: Use a database function (if you have one)
        try {
          console.log('Trying database function approach...');
          const { error: rpcError } = await supabase.rpc('create_user_profile', {
            user_id: data.user.id,
            user_email: formData.email,
            user_name: formData.name,
            user_is_admin: isAdmin
          });
          
          if (rpcError) {
            console.log('Database function failed:', rpcError);
            throw rpcError;
          } else {
            console.log('User profile created via database function!');
          }
        } catch (rpcError) {
          console.log('RPC approach failed, trying direct insert with different fields...');
          
          // APPROACH B: Try a simple insert with minimal fields
          try {
            const { error: simpleInsertError } = await supabase
              .from('users')
              .insert({
                id: data.user.id,
                email: formData.email,
                name: formData.name
              });
              
            if (simpleInsertError) {
              console.error('Simple insert failed:', simpleInsertError);
              console.error('Error code:', simpleInsertError.code);
              console.error('Error message:', simpleInsertError.message);
              console.error('Error details:', simpleInsertError.details);
              throw simpleInsertError;
            } else {
              console.log('Simple insert succeeded!');
              
              // If the simple insert worked, update with remaining fields
              const { error: updateError } = await supabase
                .from('users')
                .update({
                  points: 0,
                  bottles: 0,
                  cans: 0,
                  is_admin: isAdmin
                })
                .eq('id', data.user.id);
                
              if (updateError) {
                console.log('Update with additional fields failed, but user was created:', updateError);
              }
            }
          } catch (insertError) {
            console.error('All database approaches failed');
            throw new Error('Database error saving new user. Please contact support.');
          }
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
            navigate('/admin', { replace: true });
          } else {
            navigate('/dashboard', { replace: true });
          }
        } else {
          // Email confirmation flow
          setError('Account created successfully. Please check your email for verification.');
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