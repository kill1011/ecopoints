import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import AdminSidebar from '../components/AdminSidebar';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import '../styles/AdminSettings.css';

const AdminSettings = () => {
  const [recyclables, setRecyclables] = useState([]);
  const [uniqueMaterials, setUniqueMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [pointChanges, setPointChanges] = useState({});
  const [priceChanges, setPriceChanges] = useState({});
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
        .select('*');

      if (error) throw error;

      console.log('Fetched recyclables:', data);

      setRecyclables(data || []);

      const materialMap = new Map();
      data.forEach(item => {
        const material = item.material;
        if (!materialMap.has(material)) {
          materialMap.set(material, {
            material,
            points_per_piece: item.points_per_piece ?? 0,
            price_per_piece: item.price_per_piece ?? 0
          });
        }
      });

      const unique = Array.from(materialMap.values());
      setUniqueMaterials(unique);
      setError('');
    } catch (error) {
      console.error('Fetch error:', error);
      setError('Failed to load recyclables: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePointChange = (material, newValue) => {
    setPointChanges(prev => ({
      ...prev,
      [material]: newValue
    }));
  };

  const handlePriceChange = (material, newValue) => {
    setPriceChanges(prev => ({
      ...prev,
      [material]: newValue
    }));
  };

  const handleReset = (material) => {
    setPointChanges(prev => {
      const newPointChanges = { ...prev };
      delete newPointChanges[material];
      return newPointChanges;
    });
    setPriceChanges(prev => {
      const newPriceChanges = { ...prev };
      delete newPriceChanges[material];
      return newPriceChanges;
    });
  };

  const handleSave = async (material) => {
    const newPoints = pointChanges[material];
    const newPrice = priceChanges[material];
    
    let confirmMessage = `Are you sure you want to update ${material}?`;
    if (newPoints !== undefined) {
      confirmMessage += `\nPoints: ${newPoints} points per piece`;
    }
    if (newPrice !== undefined) {
      confirmMessage += `\nPrice: $${newPrice} per piece`;
    }
    
    const confirmSave = window.confirm(confirmMessage);
    if (!confirmSave) return;

    try {
      setLoading(true);
      setMessage({ text: '', type: '' });

      if (newPoints !== undefined) {
        if (isNaN(newPoints) || newPoints < 0) {
          throw new Error('Invalid points value: Must be a non-negative number');
        }
      }

      if (newPrice !== undefined) {
        if (isNaN(newPrice) || newPrice < 0) {
          throw new Error('Invalid price value: Must be a non-negative number');
        }
      }

      if (newPoints === undefined && newPrice === undefined) {
        throw new Error('No changes to save');
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Authentication required');
      }

      const { data: adminCheck, error: adminError } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', session.user.id)
        .single();

      if (adminError) {
        console.error('Admin check error:', adminError);
        throw new Error('Failed to verify admin status: ' + adminError.message);
      }
      if (!adminCheck?.is_admin) {
        throw new Error('Admin access required');
      }

      const updateData = {};
      if (newPoints !== undefined) updateData.points_per_piece = Number(newPoints);
      if (newPrice !== undefined) updateData.price_per_piece = Number(newPrice);
      updateData.updated_at = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('recyclables')
        .update(updateData)
        .eq('material', material);

      if (updateError) {
        console.error('Update error:', updateError);
        throw new Error('Failed to update value: ' + updateError.message);
      }

      setPointChanges(prev => {
        const newPointChanges = { ...prev };
        delete newPointChanges[material];
        return newPointChanges;
      });
      setPriceChanges(prev => {
        const newPriceChanges = { ...prev };
        delete newPriceChanges[material];
        return newPriceChanges;
      });

      await fetchRecyclables();

      setMessage({ 
        text: `Updated ${material} successfully`, 
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
          <h1>Adjust Points and Price per Recyclable Material</h1>
          
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
            <div className="settings-table">
              <div className="table-header">
                <div className="table-column material-column">Material</div>
                <div className="table-column">Points per Piece</div>
                <div className="table-column">Price per Piece</div>
                <div className="table-column actions-column">Actions</div>
              </div>
              {uniqueMaterials.map((item) => (
                <div key={item.material} className="table-row">
                  <div className="table-column material-column">
                    {item.material}
                  </div>
                  <div className="table-column">
                    <div className="value-control">
                      <input
                        type="number"
                        min="S"
                        step="0.5"
                        value={
                          pointChanges[item.material] !== undefined
                            ? pointChanges[item.material]
                            : item.points_per_piece ?? 0
                        }
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          if (!isNaN(value) && value >= 0) {
                            handlePointChange(item.material, value);
                          }
                        }}
                      />
                    </div>
                    <div className="current-value">
                      Current: {(item.points_per_piece ?? 0).toFixed(2)} points
                    </div>
                  </div>
                  <div className="table-column">
                    <div className="value-control">
                      <input
                        type="number"
                        min=""
                        step="1"
                        value={
                          priceChanges[item.material] !== undefined
                            ? priceChanges[item.material]
                            : item.price_per_piece ?? 0
                        }
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          if (!isNaN(value) && value >= 0) {
                            handlePriceChange(item.material, value);
                          }
                        }}
                      />
                    </div>
                    <div className="current-value">
                      Current: ₱{(item.price_per_piece ?? 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="table-column actions-column">
                    {(pointChanges[item.material] !== undefined || priceChanges[item.material] !== undefined) && (
                      <div className="button-group">
                        <button 
                          className="save-button"
                          onClick={() => handleSave(item.material)}
                        >
                          Save
                        </button>
                        <button 
                          className="reset-button"
                          onClick={() => handleReset(item.material)}
                        >
                          Reset
                        </button>
                      </div>
                    )}
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