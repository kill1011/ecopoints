// src/App.jsx
import React, { useEffect } from 'react';
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
// frontend/src/App.js (React example)
import { useEffect, useState } from "react";

function App() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("https://my-backend.vercel.app/api/hello")
      .then((res) => res.json())
      .then((data) => setData(data.message));
  }, []);

  return <div>{data || "Loading..."}</div>;
}

function App() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/hello")
      .then((res) => res.json())
      .then((data) => setData(data.message));
  }, []);

  return <div>{data || "Loading..."}</div>;
}

// src/App.js
function App() { 
  useEffect(() => {
    const testConnection = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('count');
        
        if (error) throw error;
        console.log('Supabase connection successful:', data);
      } catch (error) {
        console.error('Supabase connection error:', error.message);
      }
    };

    testConnection();
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app">
          <div className="content">
            <Routes>
              <Route path="/" element={<LoginPage />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/insert"
                element={
                  <ProtectedRoute>
                    <InsertPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/redemption"
                element={
                  <ProtectedRoute>
                    <Redemption />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/history"
                element={
                  <ProtectedRoute>
                    <HistoryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/contact"
                element={
                  <ProtectedRoute>
                    <ContactPage />
                  </ProtectedRoute>
                }
              />  
              <Route
                path="/admin/*"
                element={
                  <ProtectedAdminRoute>
                    <Routes>
                      <Route path="admindashboard" element={<AdminDashboard />} />
                      <Route path="redemption" element={<AdminApproval />} />
                      <Route path="history" element={<AdminHistory />} />
                      <Route path="settings" element={<AdminSettings />} />
                      <Route
                        path="dashboard"
                        element={
                          <ProtectedAdminRoute>
                            <AdminDashboard />
                          </ProtectedAdminRoute>
                        }
                      />
                    </Routes>
                  </ProtectedAdminRoute>
                }
              />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/approval" element={<AdminApproval />} />
              <Route path="/admin/history" element={<AdminHistory />} />
              <Route path="/admin/settings" element={<AdminSettings/>} />
              <Route path="/admin/viewall" element={<ViewAll />} />
            </Routes>
          </div>
          <Footer />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;