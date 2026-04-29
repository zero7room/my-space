import { Link, Route, Routes } from "react-router-dom";
import { AppContextProvider } from "./app-context.js";
import { TokenInput } from "./components/token-input.js";

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
            <Route path="/" element={<div>Threads list (coming in Task 17)</div>} />
          </Routes>
        </main>
      </div>
    </AppContextProvider>
  );
}
