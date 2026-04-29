import { Link, Route, Routes } from "react-router-dom";
import { AppContextProvider } from "./app-context.js";
import { TokenInput } from "./components/token-input.js";
import { ChannelConfig } from "./pages/channel-config.js";
import { ThreadDetail } from "./pages/thread-detail.js";
import { ThreadList } from "./pages/thread-list.js";

export function App() {
  return (
    <AppContextProvider>
      <div className="app">
        <header className="app-header">
          <Link to="/">Threads</Link>
          <Link to="/channels" style={{ marginLeft: 12 }}>
            Channels
          </Link>
          <TokenInput />
        </header>
        <main>
          <Routes>
            <Route path="/" element={<ThreadList />} />
            <Route path="/threads/:id" element={<ThreadDetail />} />
            <Route path="/channels" element={<ChannelConfig />} />
          </Routes>
        </main>
      </div>
    </AppContextProvider>
  );
}
