import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import { getMonitors, getTags } from '../api/client';
import type { Monitor, Tag } from '../types';
import MonitorSidebarItem from './MonitorSidebarItem';
import { useWebSocket, StatusUpdate } from '../hooks/useWebSocket';

interface SidebarLayoutProps {
  children: React.ReactNode;
}

interface TagGroup {
  tag: Tag | null; // null for "Untagged" group
  monitors: Monitor[];
  isExpanded: boolean;
}

export default function SidebarLayout({ children }: SidebarLayoutProps) {
  const { id } = useParams<{ id: string }>();
  const currentMonitorId = id ? parseInt(id) : null;

  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTags, setExpandedTags] = useState<Set<number | 'untagged'>>(new Set());

  // Handle real-time status updates
  const handleStatusUpdate = useCallback((update: StatusUpdate) => {
    setMonitors((prevMonitors) =>
      prevMonitors.map((monitor) => {
        if (monitor.id === update.monitor_id) {
          return {
            ...monitor,
            latest_status: {
              status: update.status,
              response_time_ms: update.response_time_ms,
              checked_at: update.checked_at,
              details: update.details,
              ssl_expiry_days: update.ssl_expiry_days,
            },
          };
        }
        return monitor;
      })
    );
  }, []);

  useWebSocket({ onStatusUpdate: handleStatusUpdate });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [monitorsData, tagsData] = await Promise.all([
        getMonitors(),
        getTags(),
      ]);
      setMonitors(monitorsData);
      setTags(tagsData);

      // Auto-expand the tag containing the current monitor
      if (currentMonitorId) {
        const currentMonitor = monitorsData.find(m => m.id === currentMonitorId);
        if (currentMonitor?.tags?.length) {
          setExpandedTags(new Set(currentMonitor.tags.map(t => t.id)));
        } else {
          setExpandedTags(new Set(['untagged']));
        }
      } else {
        // Expand all tags by default
        const allTagIds = new Set<number | 'untagged'>(tagsData.map(t => t.id));
        allTagIds.add('untagged');
        setExpandedTags(allTagIds);
      }
    } catch (err) {
      console.error('Failed to load sidebar data:', err);
    } finally {
      setLoading(false);
    }
  }

  // Filter monitors by search query
  const filteredMonitors = useMemo(() => {
    if (!searchQuery.trim()) return monitors;
    const query = searchQuery.toLowerCase().trim();
    return monitors.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.target.toLowerCase().includes(query) ||
        (m.description && m.description.toLowerCase().includes(query))
    );
  }, [monitors, searchQuery]);

  // Group monitors by tags
  const tagGroups = useMemo(() => {
    const groups: TagGroup[] = [];
    const assignedMonitorIds = new Set<number>();

    // Create groups for each tag
    for (const tag of tags) {
      const tagMonitors = filteredMonitors.filter((m) =>
        m.tags?.some((t) => t.id === tag.id)
      );
      if (tagMonitors.length > 0) {
        tagMonitors.forEach((m) => assignedMonitorIds.add(m.id));
        groups.push({
          tag,
          monitors: tagMonitors,
          isExpanded: expandedTags.has(tag.id),
        });
      }
    }

    // Create "Untagged" group for monitors without tags
    const untaggedMonitors = filteredMonitors.filter(
      (m) => !m.tags || m.tags.length === 0
    );
    if (untaggedMonitors.length > 0) {
      groups.push({
        tag: null,
        monitors: untaggedMonitors,
        isExpanded: expandedTags.has('untagged'),
      });
    }

    return groups;
  }, [filteredMonitors, tags, expandedTags]);

  const toggleTag = (tagId: number | 'untagged') => {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  return (
    <div className="sidebar-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2 className="sidebar-title">Monitors</h2>
          <div className="sidebar-search">
            <Search className="sidebar-search-icon" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="sidebar-search-input"
            />
          </div>
        </div>

        <div className="sidebar-content">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
            </div>
          ) : tagGroups.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
              {monitors.length === 0 ? 'No monitors' : 'No matches'}
            </div>
          ) : (
            <div className="sidebar-groups">
              {tagGroups.map((group) => {
                const tagId = group.tag?.id ?? 'untagged';
                const isExpanded = expandedTags.has(tagId);

                return (
                  <div key={tagId} className="sidebar-group">
                    <button
                      onClick={() => toggleTag(tagId)}
                      className="sidebar-group-header"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                      {group.tag ? (
                        <span
                          className="sidebar-tag-badge"
                          style={{
                            backgroundColor: group.tag.color + '20',
                            color: group.tag.color,
                            borderColor: group.tag.color,
                          }}
                        >
                          {group.tag.name}
                        </span>
                      ) : (
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          Untagged
                        </span>
                      )}
                      <span className="text-xs text-gray-400 ml-auto">
                        {group.monitors.length}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="sidebar-group-items">
                        {group.monitors.map((monitor) => (
                          <MonitorSidebarItem
                            key={monitor.id}
                            monitor={monitor}
                            isActive={monitor.id === currentMonitorId}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="sidebar-main">
        {children}
      </main>
    </div>
  );
}
