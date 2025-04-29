import React from 'react';
import Layout from '../components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMapMarkerAlt, faPhone, faEnvelope } from '@fortawesome/free-solid-svg-icons';
import '../styles/Contact.css';

const Contact = () => {
  return (
    <Layout title="Contact Us">
      <div className="contact-grid">
        <div className="contact-card">
          <FontAwesomeIcon icon={faMapMarkerAlt} className="contact-icon" />
          <h3>Location</h3>
          <p>Passi City College </p>
          <p>Philippines</p>
        </div>

        <div className="contact-card">
          <FontAwesomeIcon icon={faPhone} className="contact-icon" />
          <h3>Phone</h3>
          <p></p>
          <p>Mon-Fri: 9AM-5PM</p>
        </div>

        <div className="contact-card">
          <FontAwesomeIcon icon={faEnvelope} className="contact-icon" />
          <h3>Email</h3>
          <p>PccEcoPoints@ecopoints.com</p>
          <p>info@ecopoints.com</p>
        </div>
      </div>
    </Layout>
  );
};

export default Contact;