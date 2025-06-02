import React from 'react';

const InputRow = ({ label, value, onChange, type = 'text' }) => {
  return (
    <div className="flex items-center mb-2">
      <label className="w-1/4 text-right mr-4">{label}:</label>
      <input
        type={type}
        className="w-3/4 border rounded py-1 px-2 text-gray-700"
        value={value}
        onChange={onChange}
      />
    </div>
  );
};

export default InputRow;