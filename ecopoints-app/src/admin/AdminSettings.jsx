import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import AdminSidebar from '../components/AdminSidebar';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import '../styles/AdminSettings.css';

const AdminSettings = () => {
  const [recyclables, setRecyclables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [changes, setChanges] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    checkAdminAndFetchData();
  }, []);

  const checkAdminAndFetchData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate('/login');
        return;
      }

      // Verify admin status
      const { data: adminCheck, error: adminError } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', session.user.id)
        .single();

      if (adminError || !adminCheck?.is_admin) {
        navigate('/dashboard');
        return;
      }

      await fetchRecyclables();
    } catch (error) {
      console.error('Auth check failed:', error);
      navigate('/login');
    }
  };

  const fetchRecyclables = async () => {
    try {
      const { data, error } = await supabase
        .from('recyclables')
        .select('*')
        .order('name');

      if (error) throw error;

      console.log('Fetched recyclables:', data);
      setRecyclables(data || []);
      setError('');
    } catch (error) {
      console.error('Fetch error:', error);
      setError('Failed to load recyclables');
    } finally {
      setLoading(false);
    }
  };

  const handleValueChange = (id, newValue) => {
    setChanges(prev => ({
      ...prev,
      [id]: newValue
    }));
  };

  const handleSave = async (id) => {
    try {
      setLoading(true);
        setMessage({ text: '', type: '' });
      
      // Validate the new value
      const newValue = changes[id];
      if (newValue === undefined || isNaN(newValue) || newValue < 0) {
        throw new Error('Invalid value');
      }

      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Authentication required');
      }

      // Verify admin status
      const { data: adminCheck, error: adminError } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', session.user.id)
        .single();

      if (adminError || !adminCheck?.is_admin) {
        throw new Error('Admin access required');
      }

      // Update the recyclable value
      const { error: updateError } = await supabase
        .from('recyclables')
        .update({ 
          points_per_piece: newValue,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (updateError) {
        console.error('Update error:', updateError);
        throw new Error('Failed to update value');
      }

      // Clear the saved change
      setChanges(prev => {
        const newChanges = { ...prev };
        delete newChanges[id];
        return newChanges;
      });

      // Refresh the recyclables list
      await fetchRecyclables();

      // Show success message
      setMessage({ 
        text: 'Value updated successfully', 
        type: 'success' 
      });

    } catch (error) {
      console.error('Save error:', error);
      setMessage({ 
        text: error.message || 'Failed to update value', 
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    navigate('/');
  };

  return (
    <div className="app-container">
      <Header 
        userName={localStorage.getItem('user_name')}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      <AdminSidebar 
        isOpen={isSidebarOpen}
        onLogout={handleLogout}
      />
      <div className="dashboard-container">
        <main className="settings-container">
          <h1>Recyclable Values Settings</h1>
          
          {message.text && (
            <div className={`message ${message.type}`}>
              {message.text}
            </div>
          )}

          {loading ? (
            <div className="loading">Loading settings...</div>
          ) : error ? (
            <div className="error-message">{error}</div>
          ) : (
            <div className="settings-grid">
              {recyclables.map((item) => (
                <div key={item.id} className="setting-card">
                  <div className="setting-header">
                    <h3>{item.name}</h3>
                  </div>
                  <div className="setting-content">
                    <label>Points per Piece:</label>
                    <div className="value-control">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={changes[item.id] !== undefined ? 
                          changes[item.id] : 
                          item.points_per_piece}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          if (!isNaN(value) && value >= 0) {
                            handleValueChange(item.id, value);
                          }
                        }}
                      />
                      {changes[item.id] !== undefined && (
                        <button 
                          className="save-button"
                          onClick={() => handleSave(item.id)}
                        >
                          Save
                        </button>
                      )}
                    </div>
                    <div className="current-value">
                      Current value: {item.points_per_piece.toFixed(2)} points
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminSettings;