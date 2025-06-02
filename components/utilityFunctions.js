export const getColorGradeInfo = (grade) => {
  switch (grade) {
    case "A":
      return { color: "green", label: "Good" };
    case "B":
      return { color: "yellow", label: "Fair" };
    case "C":
      return { color: "orange", label: "Poor" };
    case "D":
    case "E":
      return { color: "red", label: "Bad" };
    default:
      return { color: "gray", label: "Unknown" };
  }
};

export const renderGsmSignalIcon = (signalLevel) => {
  const numBars = Math.ceil(signalLevel / 25); // Assuming signalLevel is 0-100

  return (
    <div style={{ display: "flex", alignItems: "flex-end", height: "1em" }}>
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          style={{
            width: "3px",
            height: `${(i + 1) * 4}px`,
            backgroundColor: i < numBars ? "currentColor" : "lightgray",
            marginRight: "1px",
          }}
        />
      ))}
    </div>
  );
};

export const COLOR_GRADES = {
  A: { label: 'Grade A', colorClass: 'border-green-500', dotClass: 'bg-green-500' },
  B: { label: 'Grade B', colorClass: 'border-yellow-500', dotClass: 'bg-yellow-500' },
  C: { label: 'Grade C', colorClass: 'border-orange-500', dotClass: 'bg-orange-500' },
  D: { label: 'Grade D', colorClass: 'border-red-500', dotClass: 'bg-red-500' },
  E: { label: 'Grade E', colorClass: 'border-red-700', dotClass: 'bg-red-700' },
  Unknown: { label: 'Unknown', colorClass: 'border-gray-500', dotClass: 'bg-gray-500' },
};

export const DEFAULT_COLOR_GRADE = 'Unknown';