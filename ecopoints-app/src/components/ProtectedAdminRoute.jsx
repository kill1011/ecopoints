import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../config/supabase';

const ProtectedAdminRoute = ({ children }) => {
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        // Get session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('No active session');

        // Get user data
        const userData = JSON.parse(localStorage.getItem('user'));
        console.log('Checking admin status:', userData);

        if (!userData?.is_admin) throw new Error('Not admin');

        setIsAuthorized(true);
      } catch (error) {
        console.error('Admin check failed:', error);
        setIsAuthorized(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkAdmin();
  }, []);

  if (isChecking) {
    return <div>Checking authorization...</div>;
  }

  if (!isAuthorized) {
    console.log('Unauthorized access attempt, redirecting to login');
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedAdminRoute;