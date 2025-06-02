import React from 'react';

const CheckboxInput = ({ label, checked, onChange }) => (
  <div className="flex items-center">
    <input
      type="checkbox"
      className="form-checkbox h-4 w-4 text-blue-600"
      checked={checked}
      onChange={onChange}
    />
    <label className="ml-2 text-gray-700">{label}</label>
  </div>
);

export default CheckboxInput;