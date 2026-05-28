export const Header = ({ isConnected, totalSymbols, lastUpdate }) => {
  const getStatusColor = () => {
    return isConnected ? 'text-green-400' : 'text-red-500';
  };

  const formatTime = (date) => {
    if (!date) return '--:--:--';
    return date.toLocaleTimeString();
  };

  return (
    <header className="text-center mb-12 animate-fade-in">
      <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
        🚀 SPOT-BOT
      </h1>
      <p className="text-gray-400 text-lg mb-6">Top Cryptocurrencies - 1 Hour Gainers</p>

      <div className="flex flex-wrap justify-center gap-6 md:gap-8">
        <div className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-full">
          <span className={`status-dot connected`}></span>
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-full">
          <span>📊</span>
          <span className="text-sm font-medium">{totalSymbols} symbols tracked</span>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-full">
          <span>⏱️</span>
          <span className="text-sm font-medium">Last update: {formatTime(lastUpdate)}</span>
        </div>
      </div>
    </header>
  );
};
