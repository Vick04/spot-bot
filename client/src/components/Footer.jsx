import { useEffect, useState } from 'react';

export const Footer = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <footer className="mt-12 text-center text-gray-500 text-sm">
      <p className="mb-2">Real-time data from Binance | Updates every minute</p>
      <p className="text-xs">{currentTime.toLocaleString()}</p>
    </footer>
  );
};
