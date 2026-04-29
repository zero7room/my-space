import { Link, Route, Routes } from "react-router-dom";

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <Link to="/">AI Employee</Link>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<div>Threads list (coming in Task 17)</div>} />
        </Routes>
      </main>
    </div>
  );
}
