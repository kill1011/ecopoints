// src/components/Sidebar.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faHome, 
  faRecycle, 
  faWallet, 
  faHistory, 
  faEnvelope, 
  faSignOutAlt,
  faUsers,
  faTimes 
} from '@fortawesome/free-solid-svg-icons';
import '../styles/Sidebar.css';

const Sidebar = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    setIsAdmin(user.is_admin || false);
  }, [user.is_admin]);

  const handleNavigation = (path) => {
    navigate(path);
    if (window.innerWidth < 768) {
      onClose();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const NavItem = ({ path, icon, label }) => (
    <button
      className={`nav-item ${location.pathname === path ? 'active' : ''}`}
      onClick={() => handleNavigation(path)}
    >
      <FontAwesomeIcon icon={icon} className="nav-icon" />
      <span>{label}</span>
    </button>
  );

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'active' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${isOpen ? 'active' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-container">
            <img src="/assets/LOGO.png" alt="EcoPoints Logo" className="logo" />
            <h2>EcoPoints</h2>
          </div>
          <button className="close-button" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="user-info">
          <div className="user-avatar">
            <FontAwesomeIcon icon={faUsers} />
          </div>
          <div className="user-details">
            <h3>{user.name}</h3>
            <p>{isAdmin ? 'Administrator' : 'User'}</p>
          </div>
        </div>

        <nav className="nav-menu">
          <NavItem path="/dashboard" icon={faHome} label="Dashboard" />
          <NavItem path="/insert" icon={faRecycle} label="Insert Points" />
          <NavItem path="/redemption" icon={faWallet} label="Redeem Points" />
          <NavItem path="/history" icon={faHistory} label="History" />
          <NavItem path="/contact" icon={faEnvelope} label="Contact Us" />
          
          {isAdmin && (
            <NavItem path="/admin" icon={faUsers} label="Admin Panel" />
          )}
          
          <button className="nav-item logout" onClick={handleLogout}>
            <FontAwesomeIcon icon={faSignOutAlt} className="nav-icon" />
            <span>Log Out</span>
          </button>
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;