import React from 'react';

const AmenityItem = ({ amenity }) => (
  <div className="amenity-item">
    {/* Add your rendering logic for an individual amenity item here */}
    {amenity.name}
  </div>
);

export default AmenityItem;