import React, { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom'; // Remove BrowserRouter
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import ProtectedRoute from './components/ProtectedRoute';
import InsertPage from './pages/Insert';
import Redemption from './pages/Redemption';
import HistoryPage from './pages/History';
import ContactPage from './pages/Contact';
import AdminDashboard from './pages/AdminDashboard';
import Footer from './components/Footer';
import ProtectedAdminRoute from './components/ProtectedAdminRoute';
import AdminApproval from './admin/AdminApproval';
import AdminHistory from './admin/AdminHistory';
import AdminSettings from './admin/AdminSettings';
import ViewAll from './admin/ViewAll';
import { supabase } from './config/supabase';
import { AuthProvider } from './context/AuthContext';

// Use environment variable without a default (set in Vercel)
const API_URL = process.env.REACT_APP_API_URL;

function App() {
  const [data, setData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const checkBackendConnection = async () => {
      try {
        if (!API_URL) throw new Error('API_URL is not defined in environment variables');
        console.log('Connecting to backend:', API_URL);
        const response = await fetch(`${API_URL}/api/hello`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const result = await response.json();
        console.log('Backend response:', result);
        setData(result.message);
        setIsConnected(true);
      } catch (error) {
        console.error('Backend connection error:', error.message);
        setIsConnected(false);
      }
    };

    const testSupabaseConnection = async () => {
      try {
        const { data: supabaseData, error } = await supabase
          .from('users') // Ensure this table exists
          .select('count', { count: 'exact' });
        if (error) throw error;
        console.log('Supabase connection successful:', supabaseData);
      } catch (error) {
        console.error('Supabase connection error:', error.message);
      }
    };

    checkBackendConnection();
    testSupabaseConnection();
  }, []);

  return (
    <AuthProvider>
      <div className="app">
        <div className="content">
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/insert" element={<ProtectedRoute><InsertPage /></ProtectedRoute>} />
            <Route path="/redemption" element={<ProtectedRoute><Redemption /></ProtectedRoute>} />
            <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
            <Route path="/contact" element={<ProtectedRoute><ContactPage /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedAdminRoute><AdminDashboard /></ProtectedAdminRoute>} />
            <Route path="/admin/approval" element={<ProtectedAdminRoute><AdminApproval /></ProtectedAdminRoute>} />
            <Route path="/admin/history" element={<ProtectedAdminRoute><AdminHistory /></ProtectedAdminRoute>} />
            <Route path="/admin/settings" element={<ProtectedAdminRoute><AdminSettings /></ProtectedAdminRoute>} />
            <Route path="/admin/viewall" element={<ProtectedAdminRoute><ViewAll /></ProtectedAdminRoute>} />
          </Routes>
          {!isConnected && (
            <div className="connection-status">
              Backend Status: {data || 'Not connected'} <br />
              Error: Check console for details
            </div>
          )}
        </div>
        <Footer />
      </div>
    </AuthProvider>
  );
}

export default App;