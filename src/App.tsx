import { DispatchBoard } from "./components/DispatchBoard";

function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="flex items-center justify-between border-b border-gray-800 px-6 py-3">
        <h1 className="text-lg font-semibold tracking-tight">TooManyTabs</h1>
        <button className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-500">
          + New Session
        </button>
      </header>
      <main className="p-6">
        <DispatchBoard />
      </main>
    </div>
  );
}

export default App;
