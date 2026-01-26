import { Routes, Route, NavLink } from 'react-router-dom';
import { Activity, Server, Settings, Users } from 'lucide-react';
import Dashboard from './components/Dashboard';
import MonitorList from './components/MonitorList';
import AgentList from './components/AgentList';
import SettingsPage from './components/SettingsPage';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Activity className="h-8 w-8 text-indigo-600" />
              <span className="text-xl font-bold text-gray-900">OnlineTracker</span>
            </div>
            <nav className="flex gap-1">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-100'
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
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-100'
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
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-100'
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
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                <Settings className="h-4 w-4" />
                Settings
              </NavLink>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/monitors" element={<MonitorList />} />
          <Route path="/agents" element={<AgentList />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
