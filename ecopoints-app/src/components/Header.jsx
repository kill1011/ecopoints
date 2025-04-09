import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHome, faUser, faCog, faRecycle, faBars } from '@fortawesome/free-solid-svg-icons';
import '../styles/Header.css';

const Header = ({ userName, toggleSidebar }) => {
  return (
    <header className="header">
      <button className="sidebar-toggle" onClick={toggleSidebar}>
        <FontAwesomeIcon icon={faBars} />
      </button>

      <div className="header-content">
        <h1>
          <FontAwesomeIcon icon={faRecycle} className="header-icon" /> 
          EcoPoints
        </h1>
        <div className="user-info">
          <div className="logo-container">
          <img src="../assets/PCC.png" alt="PCC Logo" className="logo" />
          <img src="../assets/LOGO.png" alt="PCC Logo" className="logo" />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;