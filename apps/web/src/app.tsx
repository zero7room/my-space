import { Link, Route, Routes } from "react-router-dom";
import { AppContextProvider } from "./app-context.js";
import { TokenInput } from "./components/token-input.js";
import { ThreadList } from "./pages/thread-list.js";

export function App() {
  return (
    <AppContextProvider>
      <div className="app">
        <header className="app-header">
          <Link to="/">AI Employee</Link>
          <TokenInput />
        </header>
        <main>
          <Routes>
            <Route path="/" element={<ThreadList />} />
            <Route path="/threads/:id" element={<div>Thread detail (coming in Task 18)</div>} />
          </Routes>
        </main>
      </div>
    </AppContextProvider>
  );
}
