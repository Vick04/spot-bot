export const GainerTable = ({ gainers }) => {
  const formatPrice = (price) => {
    if (price < 0.01) {
      return price.toFixed(8);
    }
    return price.toFixed(6);
  };

  const formatGain = (gain) => {
    return gain.toFixed(2);
  };

  if (gainers.length === 0) {
    return (
      <div className="bg-gray-900/50 border border-cyan-500/20 rounded-lg overflow-hidden shadow-2xl">
        <div className="p-12 text-center">
          <p className="text-gray-400">Loading gainers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 border border-cyan-500/20 rounded-lg overflow-hidden shadow-2xl animate-slide-up">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-b border-cyan-500/30">
              <th className="px-6 py-4 text-left text-xs font-semibold text-cyan-400 uppercase tracking-wider">#</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-cyan-400 uppercase tracking-wider">Symbol</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-cyan-400 uppercase tracking-wider">1h Gain %</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-cyan-400 uppercase tracking-wider">Price</th>
            </tr>
          </thead>
          <tbody>
            {gainers.map((gainer, index) => {
              const isPositive = gainer.gainer1h > 0;
              const gainColor = isPositive ? 'text-green-400' : 'text-red-500';

              return (
                <tr
                  key={`${gainer.symbol}-${index}`}
                  className="border-b border-cyan-500/10 hover:bg-cyan-500/10 transition-colors duration-200"
                >
                  <td className="px-6 py-4">
                    <span className="text-cyan-400 font-bold text-lg">#{index + 1}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-semibold text-white">{gainer.symbol}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`font-bold text-lg ${gainColor}`}>
                      {isPositive ? '+' : ''}
                      {formatGain(gainer.gainer1h)}%
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-gray-400 font-mono">${formatPrice(gainer.price)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
