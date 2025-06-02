import React from 'react';

const InfoItem = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
    <span style={{ fontWeight: 'bold' }}>{label}:</span>
    <span>{value}</span>
  </div>
);

export default InfoItem;