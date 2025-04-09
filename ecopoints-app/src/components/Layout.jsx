  import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import '../styles/Layout.css';

const Layout = ({ children, title }) => {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    if (!token || !user.id) {
      navigate('/login');
    }
  }, []);

  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <div className="app-container">
      <Header 
        userName={user.name} 
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
      />
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)}
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