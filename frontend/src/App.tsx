import { useEffect, useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { Activity, Server, Settings, Users, Moon, Sun } from 'lucide-react';
import Dashboard from './components/Dashboard';
import MonitorList from './components/MonitorList';
import MonitorDetail from './components/MonitorDetail';
import AgentList from './components/AgentList';
import SettingsPage from './components/SettingsPage';

export const APP_VERSION = '2.0.1';

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true; // Default to dark
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Activity className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
              <div className="flex flex-col">
                <span className="text-xl font-bold text-gray-900 dark:text-white leading-tight">OnlineTracker</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">v{APP_VERSION}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <nav className="flex gap-1">
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`
                  }
                >
                  Dashboard
                </NavLink>
                <NavLink
                  to="/monitors"
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`
                  }
                >
                  <Server className="h-4 w-4" />
                  Monitors
                </NavLink>
                <NavLink
                  to="/agents"
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`
                  }
                >
                  <Users className="h-4 w-4" />
                  Agents
                </NavLink>
                <NavLink
                  to="/settings"
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`
                  }
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </NavLink>
              </nav>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/monitor/:id" element={<MonitorDetail />} />
          <Route path="/monitors" element={<MonitorList />} />
          <Route path="/agents" element={<AgentList />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <p>©opyright 2026 Justin Dube. All Rights Reserved.</p>
        <p>Designed by 21 Mexican Jumping Llamas</p>
      </footer>
    </div>
  );
}

export default App;
