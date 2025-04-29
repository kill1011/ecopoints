import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faChartLine, 
  faHistory, 
  faCheckCircle,
  faCog,
  faSignOutAlt 
} from '@fortawesome/free-solid-svg-icons';
import '../styles/AdminSidebar.css';

const AdminSidebar = ({ isOpen }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  return (
    <div className={`admin-sidebar ${isOpen ? 'open' : ''}`}>
      <nav>
        <ul>
          <li className={location.pathname === '/admin/dashboard' ? 'active' : ''}>
            <Link to="/admin/dashboard">
              <FontAwesomeIcon icon={faChartLine} />
              <span>Dashboard</span>
            </Link>
          </li>
          <li className={location.pathname === '/admin/approval' ? 'active' : ''}>
            <Link to="/admin/approval">
              <FontAwesomeIcon icon={faCheckCircle} />
              <span>Approvals</span>
            </Link>
          </li>
          <li className={location.pathname === '/admin/history' ? 'active' : ''}>
            <Link to="/admin/history">
              <FontAwesomeIcon icon={faHistory} />
              <span>History</span>
            </Link>
          </li>

          <li>
            <button onClick={handleLogout} className="logout-button">
              <FontAwesomeIcon icon={faSignOutAlt} />
              <span>Logout</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
};

export default AdminSidebar;