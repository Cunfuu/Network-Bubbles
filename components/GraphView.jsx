import React, { useState, useEffect, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';

const GraphView = ({ graphData, title, xLabel, yLabel, tooltipLabel, legendDisplay = true }) => {
  const [chartData, setChartData] = useState({ datasets: [] });
  const chartRef = useRef(null);

  useEffect(() => {
    if (graphData && graphData.length > 0) {
      const labels = graphData.map(item => item.timestamp);
      const data = graphData.map(item => item.value);

      setChartData({
        labels,
        datasets: [
          {
            label: tooltipLabel,
            data,
            fill: false,
            backgroundColor: 'rgba(75,192,192,0.2)',
            borderColor: 'rgba(75,192,192,1)',
            tension: 0.1,
          },
        ],
      });
    }
  }, [graphData, tooltipLabel]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: legendDisplay,
      },
      title: {
        display: true,
        text: title,
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.raw !== null) {
              label += context.raw;
            }
            return label;
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: xLabel,
        },
        ticks: {
            autoSkip: true,
            maxTicksLimit: 20
        }
      },
      y: {
        title: {
          display: true,
          text: yLabel,
        },
      },
    },
  };

  return (
    <div style={{ height: '300px' }}>
      {chartData.datasets.length > 0 && (
        <Line ref={chartRef} data={chartData} options={options} />
      )}
    </div>
  );
};

export default GraphView;