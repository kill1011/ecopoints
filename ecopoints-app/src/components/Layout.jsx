import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import Header from './Header';
import Sidebar from './Sidebar';
import '../styles/Layout.css';

// Supabase configuration
const supabaseUrl = "https://xvxlddakxhircvunyhbt.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2eGxkZGFreGhpcmN2dW55aGJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwMjE2MTIsImV4cCI6MjA2MDU5NzYxMn0.daBvBBLDOngBEgjnz8ijnIWYFEqCh612xG_r_Waxfeo";
const supabase = createClient(supabaseUrl, supabaseKey);

const Layout = ({ children, title }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const initializeAuth = async () => {
      // Check for existing session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Fetch user profile from the users table
        const { data: profile, error } = await supabase
          .from('users')
          .select('id, email, name, is_admin, points, money, bottles, cans')
          .eq('id', session.user.id)
          .single();

        if (error || !profile) {
          console.error('Error fetching user profile:', error);
          await supabase.auth.signOut();
          navigate('/login');
          return;
        }

        setUser(profile);
        // Update localStorage to maintain consistency with LoginPage
        localStorage.setItem('user', JSON.stringify(profile));
        localStorage.setItem('user_id', profile.id);
        localStorage.setItem('is_admin', profile.is_admin.toString());
      } else {
        navigate('/login');
      }
    };

    initializeAuth();

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        supabase
          .from('users')
          .select('id, email, name, is_admin, points, money, bottles, cans')
          .eq('id', session.user.id)
          .single()
          .then(({ data: profile, error }) => {
            if (error || !profile) {
              console.error('Error fetching user profile:', error);
              supabase.auth.signOut();
              navigate('/login');
              return;
            }
            setUser(profile);
            localStorage.setItem('user', JSON.stringify(profile));
            localStorage.setItem('user_id', profile.id);
            localStorage.setItem('is_admin', profile.is_admin.toString());
          });
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('user_id');
        localStorage.removeItem('is_admin');
        navigate('/login');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('user_id');
      localStorage.removeItem('is_admin');
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
      alert('Failed to log out. Please try again.');
    }
  };

  if (!user) {
    return null; // Render nothing while checking auth
  }

  return (
    <div className="app-container">
      <Header 
        userName={user.name} 
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
      />
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)}
        onLogout={handleLogout}
        isAdmin={user.is_admin}
      />
      <div className="main-container">
        <div className="content-wrapper">
          {title && <h1 className="page-title">{title}</h1>}
          {children}
        </div>
      </div>
    </div>
  );
};

export default Layout;