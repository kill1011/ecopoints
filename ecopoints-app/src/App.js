import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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

const API_URL = process.env.REACT_APP_API_URL || 'https://ecopoints-api.vercel.app';

function App() {
  const [data, setData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState('Checking...');

  const checkBackendConnection = async (retries = 3, delay = 1000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Attempt ${attempt}: Fetching GET ${API_URL}/api/health`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${API_URL}/api/health`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          mode: 'cors',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        console.log('Health response:', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'No response body');
          throw new Error(`HTTP error: ${response.status} ${response.statusText}, Body: ${errorText}`);
        }

        const result = await response.json();
        console.log('Health data:', result);
        setData(result.status || 'ok');
        setIsConnected(true);
        return;
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, {
          message: error.message,
          name: error.name,
          stack: error.stack,
          cause: error.cause,
        });
        if (attempt < retries) {
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error('Backend connection failed:', error.message);
          setIsConnected(false);
          setData(`Failed: ${error.message.includes('fetch') ? 'Backend unreachable' : error.message}`);
        }
      }
    }
  };

  const testSupabaseConnection = async () => {
    let isMounted = true;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const { data: supabaseData, error } = await supabase
        .from('device_control')
        .select('device_id, command')
        .limit(1)
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (isMounted && !error) {
        console.log('Supabase connected:', supabaseData);
        setSupabaseStatus('Connected');
      }
    } catch (error) {
      if (isMounted) {
        console.error('Supabase error:', error.message);
        setSupabaseStatus(error.name === 'AbortError' ? 'Failed: Request timed out' : `Failed: ${error.message}`);
      }
    }
    return () => {
      isMounted = false;
    };
  };

  useEffect(() => {
    let cleanup = checkBackendConnection();
    const supabaseCleanup = testSupabaseConnection();

    // Cleanup function to handle unmount
    return () => {
      if (typeof cleanup === 'function') cleanup();
      if (typeof supabaseCleanup === 'function') supabaseCleanup();
      // Add unsubscribe for real-time if used
      supabase.removeAllChannels?.(); // Clean up any real-time subscriptions if present
    };
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
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
            <div className="connection-status">
              Backend Status: {isConnected ? 'Connected' : 'Not connected'} <br />
              Supabase Status: {supabaseStatus} <br />
              {data && `Message: ${data}`}
            </div>
          </div>
          <Footer />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;