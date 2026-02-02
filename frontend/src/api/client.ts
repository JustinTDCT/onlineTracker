import type {
  Monitor,
  MonitorCreate,
  MonitorTestResult,
  StatusHistoryPoint,
  Agent,
  PendingAgent,
  Settings,
  StatusOverview,
  PollPageResult,
  ResultsPage,
  MonitorDefaults,
  ExportData,
  ImportData,
  ImportResult,
  Tag,
  TagCreate,
} from '../types';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// Monitors
export async function getMonitors(): Promise<Monitor[]> {
  return fetchJson(`${API_BASE}/monitors`);
}

export async function getMonitorDefaults(): Promise<MonitorDefaults> {
  return fetchJson(`${API_BASE}/monitors/defaults`);
}

export async function getMonitor(id: number): Promise<Monitor> {
  return fetchJson(`${API_BASE}/monitors/${id}`);
}

export async function createMonitor(data: MonitorCreate): Promise<Monitor> {
  return fetchJson(`${API_BASE}/monitors`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMonitor(
  id: number,
  data: Partial<MonitorCreate>
): Promise<Monitor> {
  return fetchJson(`${API_BASE}/monitors/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteMonitor(id: number): Promise<void> {
  return fetchJson(`${API_BASE}/monitors/${id}`, {
    method: 'DELETE',
  });
}

export async function testMonitor(id: number): Promise<MonitorTestResult> {
  return fetchJson(`${API_BASE}/monitors/${id}/test`, {
    method: 'POST',
  });
}

export async function pollPage(url: string, secure: boolean): Promise<PollPageResult> {
  return fetchJson(`${API_BASE}/monitors/poll`, {
    method: 'POST',
    body: JSON.stringify({ url, secure }),
  });
}

export async function getMonitorHistory(
  id: number,
  hours = 72
): Promise<StatusHistoryPoint[]> {
  return fetchJson(`${API_BASE}/monitors/${id}/history?hours=${hours}`);
}

// Batch history for all monitors (used by Dashboard)
export async function getBatchHistory(
  hours = 24
): Promise<Record<string, StatusHistoryPoint[]>> {
  return fetchJson(`${API_BASE}/monitors/batch-history?hours=${hours}`);
}

export async function getMonitorResults(
  id: number,
  hours = 24,
  page = 1,
  perPage = 25
): Promise<ResultsPage> {
  return fetchJson(
    `${API_BASE}/monitors/${id}/results?hours=${hours}&page=${page}&per_page=${perPage}`
  );
}

export interface ResponseTimePoint {
  timestamp: string;
  response_time_ms: number | null;
  status: string;
}

export async function getResponseTimes(
  id: number,
  hours = 24
): Promise<ResponseTimePoint[]> {
  return fetchJson(`${API_BASE}/monitors/${id}/response-times?hours=${hours}`);
}

// Agents
export async function getAgents(): Promise<Agent[]> {
  return fetchJson(`${API_BASE}/agents`);
}

export async function approveAgent(
  id: string,
  approved: boolean,
  name?: string
): Promise<void> {
  return fetchJson(`${API_BASE}/agents/${id}/approve`, {
    method: 'PUT',
    body: JSON.stringify({ approved, name }),
  });
}

export async function deleteAgent(id: string): Promise<void> {
  return fetchJson(`${API_BASE}/agents/${id}`, {
    method: 'DELETE',
  });
}

// Pending Agents
export async function getPendingAgents(): Promise<PendingAgent[]> {
  return fetchJson(`${API_BASE}/agents/pending`);
}

export async function approvePendingAgent(uuid: string): Promise<void> {
  return fetchJson(`${API_BASE}/agents/pending/${uuid}/approve`, {
    method: 'POST',
  });
}

export async function dismissPendingAgent(uuid: string): Promise<void> {
  return fetchJson(`${API_BASE}/agents/pending/${uuid}`, {
    method: 'DELETE',
  });
}

// Settings
export async function getSettings(): Promise<Settings> {
  return fetchJson(`${API_BASE}/settings`);
}

export async function updateSettings(data: Partial<Settings>): Promise<Settings> {
  return fetchJson(`${API_BASE}/settings`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function testEmail(): Promise<{ success: boolean; message: string }> {
  return fetchJson(`${API_BASE}/settings/test-email`, {
    method: 'POST',
  });
}

export async function exportData(): Promise<ExportData> {
  return fetchJson(`${API_BASE}/settings/export`);
}

export async function importData(
  data: ImportData,
  replaceExisting: boolean = false
): Promise<ImportResult> {
  return fetchJson(`${API_BASE}/settings/import?replace_existing=${replaceExisting}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Status
export async function getStatusOverview(): Promise<StatusOverview> {
  return fetchJson(`${API_BASE}/status/overview`);
}

// Tags
export async function getTags(): Promise<Tag[]> {
  return fetchJson(`${API_BASE}/tags`);
}

export async function createTag(data: TagCreate): Promise<Tag> {
  return fetchJson(`${API_BASE}/tags`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTag(id: number, data: Partial<TagCreate>): Promise<Tag> {
  return fetchJson(`${API_BASE}/tags/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteTag(id: number): Promise<void> {
  return fetchJson(`${API_BASE}/tags/${id}`, {
    method: 'DELETE',
  });
}

export async function setMonitorTags(monitorId: number, tagIds: number[]): Promise<Tag[]> {
  return fetchJson(`${API_BASE}/tags/monitors/${monitorId}/tags`, {
    method: 'PUT',
    body: JSON.stringify({ tag_ids: tagIds }),
  });
}

export async function getMonitorTags(monitorId: number): Promise<Tag[]> {
  return fetchJson(`${API_BASE}/tags/monitors/${monitorId}/tags`);
}

// Monitors with tag filter
export async function getMonitorsByTag(tagId: number): Promise<Monitor[]> {
  return fetchJson(`${API_BASE}/monitors?tag_id=${tagId}`);
}
