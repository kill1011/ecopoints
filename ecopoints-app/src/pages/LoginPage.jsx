import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import '../styles/LoginPage.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignup) {
        const { data: { user }, error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: { username: formData.username },
          },
        });

        if (signUpError) throw new Error(signUpError.message);
        if (!user) throw new Error('Signup successful, please confirm your email.');

        const { error: insertError } = await supabase
          .from('users')
          .upsert({
            id: user.id,
            username: formData.username,
            total_points: 0,
          });

        if (insertError) throw new Error('Failed to create user profile: ' + insertError.message);

        setError('Signup successful! Check your email to confirm.');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (signInError) throw new Error(signInError.message);

        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <h1>{isSignup ? 'Sign Up' : 'Login'}</h1>
      <form onSubmit={handleSubmit}>
        {isSignup && (
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              required
            />
          </div>
        )}
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            required
          />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            required
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Processing...' : isSignup ? 'Sign Up' : 'Login'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <p>
        {isSignup ? 'Already have an account?' : 'Need an account?'}{' '}
        <button onClick={() => setIsSignup(!isSignup)}>
          {isSignup ? 'Login' : 'Sign Up'}
        </button>
      </p>
    </div>
  );
};

export default LoginPage;