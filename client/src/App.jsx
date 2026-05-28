import { useWebSocket } from './hooks/useWebSocket';
import { Header } from './components/Header';
import { GainerTable } from './components/GainerTable';
import { Footer } from './components/Footer';
import './index.css';

function App() {
  const { isConnected, gainers, totalSymbols, lastUpdate } = useWebSocket();

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <Header
          isConnected={isConnected}
          totalSymbols={totalSymbols}
          lastUpdate={lastUpdate}
        />
        <GainerTable gainers={gainers} />
        <Footer />
      </div>
    </div>
  );
}

export default App;
