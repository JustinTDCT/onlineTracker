# OnlineTracker iOS App Specification

## Overview

Build a native iOS app (SwiftUI) for the OnlineTracker monitoring system. The app displays monitor status, history, and receives push notifications when monitors go down or recover.

---

## Backend Server Information

- **Base URL**: Configure in app settings (e.g., `https://your-server.com`)
- **API Prefix**: `/api`
- **Authentication**: None currently (open API)
- **Content-Type**: `application/json`

---

## API Endpoints

### Status Overview

**GET** `/api/status/overview`

Returns dashboard summary data.

**Response:**
```json
{
  "total_monitors": 5,
  "monitors_up": 4,
  "monitors_down": 0,
  "monitors_degraded": 1,
  "monitors_unknown": 0,
  "agents_total": 2,
  "agents_pending": 0,
  "overall_uptime_24h": 99.5,
  "monitors": [
    {
      "id": 1,
      "name": "Google DNS",
      "type": "ping",
      "status": "up",
      "uptime_24h": 100.0,
      "last_check": "2026-01-27T10:30:00Z"
    }
  ]
}
```

---

### List Monitors

**GET** `/api/monitors`

Returns all monitors with their latest status.

**Response:**
```json
[
  {
    "id": 1,
    "agent_id": null,
    "type": "ping",
    "name": "Google DNS",
    "description": "Primary DNS server",
    "target": "8.8.8.8",
    "config": {
      "ping_count": 5,
      "ping_ok_threshold_ms": 80,
      "ping_degraded_threshold_ms": 200
    },
    "check_interval": 60,
    "enabled": true,
    "created_at": "2026-01-15T08:00:00Z",
    "latest_status": {
      "status": "up",
      "response_time_ms": 25,
      "checked_at": "2026-01-27T10:30:00Z",
      "details": "5/5 packets received, avg 25ms",
      "ssl_expiry_days": null
    }
  }
]
```

---

### Get Single Monitor

**GET** `/api/monitors/{id}`

Returns a single monitor with its latest status.

**Response:** Same structure as single item in list above.

---

### Get Monitor History

**GET** `/api/monitors/{id}/history?hours=72`

Returns status history grouped in 15-minute intervals.

**Query Parameters:**
- `hours` (optional, default 72, max 8760): Hours of history to retrieve

**Response:**
```json
[
  {
    "timestamp": "2026-01-27T10:00:00Z",
    "status": "up",
    "uptime_percent": 100.0,
    "response_time_avg_ms": 28
  },
  {
    "timestamp": "2026-01-27T10:15:00Z",
    "status": "degraded",
    "uptime_percent": 75.0,
    "response_time_avg_ms": 180
  }
]
```

---

### Get Monitor Results (Individual Checks)

**GET** `/api/monitors/{id}/results?hours=24&page=1&per_page=25`

Returns paginated individual check results.

**Query Parameters:**
- `hours` (optional, default 24): Hours of results
- `page` (optional, default 1): Page number
- `per_page` (optional, default 25, max 100): Items per page

**Response:**
```json
{
  "items": [
    {
      "id": 12345,
      "checked_at": "2026-01-27T10:30:00Z",
      "status": "up",
      "response_time_ms": 25,
      "details": "5/5 packets received, avg 25ms",
      "ssl_expiry_days": null
    }
  ],
  "total": 150,
  "page": 1,
  "per_page": 25,
  "total_pages": 6
}
```

---

### List Agents

**GET** `/api/agents`

Returns all registered monitoring agents.

**Response:**
```json
[
  {
    "id": "agent-uuid-here",
    "name": "Office Network",
    "status": "approved",
    "last_seen": "2026-01-27T10:29:00Z",
    "created_at": "2026-01-20T12:00:00Z",
    "monitor_count": 3
  }
]
```

---

### Health Check

**GET** `/health`

Simple health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "mode": "server"
}
```

---

## Data Models (Swift)

```swift
import Foundation

// MARK: - Status Overview

struct StatusOverview: Codable {
    let totalMonitors: Int
    let monitorsUp: Int
    let monitorsDown: Int
    let monitorsDegraded: Int
    let monitorsUnknown: Int
    let agentsTotal: Int
    let agentsPending: Int
    let overallUptime24h: Double
    let monitors: [MonitorSummary]
    
    enum CodingKeys: String, CodingKey {
        case totalMonitors = "total_monitors"
        case monitorsUp = "monitors_up"
        case monitorsDown = "monitors_down"
        case monitorsDegraded = "monitors_degraded"
        case monitorsUnknown = "monitors_unknown"
        case agentsTotal = "agents_total"
        case agentsPending = "agents_pending"
        case overallUptime24h = "overall_uptime_24h"
        case monitors
    }
}

struct MonitorSummary: Codable, Identifiable {
    let id: Int
    let name: String
    let type: MonitorType
    let status: MonitorStatus
    let uptime24h: Double
    let lastCheck: String?
    
    enum CodingKeys: String, CodingKey {
        case id, name, type, status
        case uptime24h = "uptime_24h"
        case lastCheck = "last_check"
    }
}

// MARK: - Monitor

struct Monitor: Codable, Identifiable {
    let id: Int
    let agentId: String?
    let type: MonitorType
    let name: String
    let description: String?
    let target: String
    let config: MonitorConfig?
    let checkInterval: Int
    let enabled: Bool
    let createdAt: String
    let latestStatus: LatestStatus?
    
    enum CodingKeys: String, CodingKey {
        case id
        case agentId = "agent_id"
        case type, name, description, target, config
        case checkInterval = "check_interval"
        case enabled
        case createdAt = "created_at"
        case latestStatus = "latest_status"
    }
}

struct MonitorConfig: Codable {
    let expectedStatus: Int?
    let expectedBodyHash: String?
    let expectedContent: String?
    let timeoutSeconds: Int?
    let pingCount: Int?
    let pingOkThresholdMs: Int?
    let pingDegradedThresholdMs: Int?
    let httpOkThresholdMs: Int?
    let httpDegradedThresholdMs: Int?
    let sslOkThresholdDays: Int?
    let sslWarningThresholdDays: Int?
    
    enum CodingKeys: String, CodingKey {
        case expectedStatus = "expected_status"
        case expectedBodyHash = "expected_body_hash"
        case expectedContent = "expected_content"
        case timeoutSeconds = "timeout_seconds"
        case pingCount = "ping_count"
        case pingOkThresholdMs = "ping_ok_threshold_ms"
        case pingDegradedThresholdMs = "ping_degraded_threshold_ms"
        case httpOkThresholdMs = "http_ok_threshold_ms"
        case httpDegradedThresholdMs = "http_degraded_threshold_ms"
        case sslOkThresholdDays = "ssl_ok_threshold_days"
        case sslWarningThresholdDays = "ssl_warning_threshold_days"
    }
}

struct LatestStatus: Codable {
    let status: MonitorStatus
    let responseTimeMs: Int?
    let checkedAt: String
    let details: String?
    let sslExpiryDays: Int?
    
    enum CodingKeys: String, CodingKey {
        case status
        case responseTimeMs = "response_time_ms"
        case checkedAt = "checked_at"
        case details
        case sslExpiryDays = "ssl_expiry_days"
    }
}

// MARK: - History

struct StatusHistoryPoint: Codable, Identifiable {
    var id: String { timestamp }
    let timestamp: String
    let status: MonitorStatus
    let uptimePercent: Double
    let responseTimeAvgMs: Int?
    
    enum CodingKeys: String, CodingKey {
        case timestamp, status
        case uptimePercent = "uptime_percent"
        case responseTimeAvgMs = "response_time_avg_ms"
    }
}

// MARK: - Results

struct ResultsPage: Codable {
    let items: [MonitorResult]
    let total: Int
    let page: Int
    let perPage: Int
    let totalPages: Int
    
    enum CodingKeys: String, CodingKey {
        case items, total, page
        case perPage = "per_page"
        case totalPages = "total_pages"
    }
}

struct MonitorResult: Codable, Identifiable {
    let id: Int
    let checkedAt: String
    let status: MonitorStatus
    let responseTimeMs: Int?
    let details: String?
    let sslExpiryDays: Int?
    
    enum CodingKeys: String, CodingKey {
        case id
        case checkedAt = "checked_at"
        case status
        case responseTimeMs = "response_time_ms"
        case details
        case sslExpiryDays = "ssl_expiry_days"
    }
}

// MARK: - Agents

struct Agent: Codable, Identifiable {
    let id: String
    let name: String?
    let status: AgentStatus
    let lastSeen: String?
    let createdAt: String
    let monitorCount: Int
    
    enum CodingKeys: String, CodingKey {
        case id, name, status
        case lastSeen = "last_seen"
        case createdAt = "created_at"
        case monitorCount = "monitor_count"
    }
}

// MARK: - Enums

enum MonitorType: String, Codable {
    case ping
    case http
    case https
    case ssl
}

enum MonitorStatus: String, Codable {
    case up
    case down
    case degraded
    case unknown
}

enum AgentStatus: String, Codable {
    case pending
    case approved
    case rejected
}
```

---

## Push Notification Setup

### Backend Endpoint (Implemented)

The iOS app registers its device token with the backend.

**POST** `/api/devices/register`

**Request:**
```json
{
  "device_token": "abc123...",
  "platform": "ios",
  "app_version": "1.0.0"
}
```

**Response:**
```json
{
  "success": true,
  "device_id": 1,
  "message": "Device registered successfully"
}
```

**DELETE** `/api/devices/{device_token}`

Unregisters a device from push notifications.

**Response:**
```json
{
  "success": true,
  "message": "Device unregistered successfully"
}
```

### Push Notification Payload Format

When the backend sends a push notification, it will use this format:

```json
{
  "aps": {
    "alert": {
      "title": "Monitor DOWN",
      "body": "Google DNS is not responding"
    },
    "sound": "default",
    "badge": 1
  },
  "monitor_id": 1,
  "monitor_name": "Google DNS",
  "status": "down",
  "details": "Request timeout after 10s"
}
```

### iOS App Requirements

1. **Request notification permission** on first launch
2. **Register for remote notifications** with APNs
3. **Send device token** to backend `/api/devices/register`
4. **Handle incoming notifications**:
   - When app is in foreground: Show in-app alert
   - When app is in background: System notification
   - When notification tapped: Navigate to the relevant monitor

### Xcode Configuration

1. **Signing & Capabilities**:
   - Add "Push Notifications" capability
   - Add "Background Modes" capability → Enable "Remote notifications"

2. **Info.plist**: No special entries needed for basic push

---

## App Architecture

### Recommended Structure

```
OnlineTracker/
├── OnlineTrackerApp.swift          # App entry point
├── ContentView.swift               # Main tab view
├── Models/
│   └── Models.swift                # All Codable structs above
├── Services/
│   ├── APIClient.swift             # Network layer
│   ├── NotificationManager.swift   # Push notification handling
│   └── SettingsManager.swift       # UserDefaults wrapper
├── Views/
│   ├── Dashboard/
│   │   └── DashboardView.swift     # Overview stats
│   ├── Monitors/
│   │   ├── MonitorListView.swift   # List of all monitors
│   │   ├── MonitorRowView.swift    # Single row in list
│   │   └── MonitorDetailView.swift # Detail + history
│   ├── Agents/
│   │   └── AgentListView.swift     # List of agents
│   └── Settings/
│       └── SettingsView.swift      # Server URL, notifications
└── Components/
    ├── StatusBadge.swift           # Up/Down/Degraded indicator
    ├── HistoryChart.swift          # Status history visualization
    └── RefreshableScrollView.swift # Pull to refresh wrapper
```

---

## UI Requirements

### Dashboard Screen

- **Summary cards**: Total monitors, Up, Down, Degraded counts
- **Overall uptime**: 24-hour percentage
- **Quick list**: All monitors with status indicators
- **Pull to refresh**

### Monitor List Screen

- **Grouped by status**: Down first, then degraded, then up
- **Each row shows**: Name, type icon, target, status badge, last check time, response time
- **Tap to navigate** to detail view

### Monitor Detail Screen

- **Header**: Name, type, target, current status
- **Stats**: Response time, uptime percentage
- **History chart**: Visual timeline of status (use bars or dots colored by status)
- **Recent results**: Scrollable list of individual checks

### Settings Screen

- **Server URL**: Text field to configure backend URL
- **Notifications**: Toggle to enable/disable
- **Test connection**: Button to verify server reachability
- **About**: App version

---

## Color Scheme

| Status | Color |
|--------|-------|
| Up | Green (`#22C55E`) |
| Down | Red (`#EF4444`) |
| Degraded | Yellow/Amber (`#F59E0B`) |
| Unknown | Gray (`#6B7280`) |

---

## Refresh Strategy

- **Dashboard**: Auto-refresh every 30 seconds when visible
- **Monitor list**: Pull to refresh + auto-refresh every 60 seconds
- **Monitor detail**: Pull to refresh
- **Background refresh**: Consider using Background App Refresh for updating badge count

---

## Error Handling

- **Network errors**: Show alert with retry option
- **Invalid server URL**: Prompt to check settings
- **Server unreachable**: Show offline indicator, cache last known data
- **Empty states**: Friendly messages when no monitors exist

---

## Local Storage

Use `UserDefaults` for:
- `serverURL`: String - Backend server URL
- `notificationsEnabled`: Bool - User preference
- `deviceToken`: String - APNs token (for reference)

Consider using `@AppStorage` property wrapper for SwiftUI integration.

---

## API Client Example

```swift
import Foundation

class APIClient: ObservableObject {
    @Published var isLoading = false
    @Published var error: Error?
    
    private var baseURL: String {
        UserDefaults.standard.string(forKey: "serverURL") ?? ""
    }
    
    func fetch<T: Codable>(_ endpoint: String) async throws -> T {
        guard !baseURL.isEmpty else {
            throw APIError.noServerConfigured
        }
        
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            throw APIError.invalidURL
        }
        
        let (data, response) = try await URLSession.shared.data(from: url)
        
        guard let httpResponse = response as? HTTPURLResponse,
              200..<300 ~= httpResponse.statusCode else {
            throw APIError.serverError
        }
        
        let decoder = JSONDecoder()
        return try decoder.decode(T.self, from: data)
    }
    
    func getOverview() async throws -> StatusOverview {
        try await fetch("/api/status/overview")
    }
    
    func getMonitors() async throws -> [Monitor] {
        try await fetch("/api/monitors")
    }
    
    func getMonitor(id: Int) async throws -> Monitor {
        try await fetch("/api/monitors/\(id)")
    }
    
    func getHistory(monitorId: Int, hours: Int = 72) async throws -> [StatusHistoryPoint] {
        try await fetch("/api/monitors/\(monitorId)/history?hours=\(hours)")
    }
    
    func getResults(monitorId: Int, hours: Int = 24, page: Int = 1) async throws -> ResultsPage {
        try await fetch("/api/monitors/\(monitorId)/results?hours=\(hours)&page=\(page)")
    }
    
    func getAgents() async throws -> [Agent] {
        try await fetch("/api/agents")
    }
    
    func checkHealth() async throws -> Bool {
        let _: [String: String] = try await fetch("/health")
        return true
    }
}

enum APIError: LocalizedError {
    case noServerConfigured
    case invalidURL
    case serverError
    
    var errorDescription: String? {
        switch self {
        case .noServerConfigured:
            return "Please configure the server URL in Settings"
        case .invalidURL:
            return "Invalid server URL"
        case .serverError:
            return "Server error occurred"
        }
    }
}
```

---

## Notification Manager Example

```swift
import Foundation
import UserNotifications
import UIKit

class NotificationManager: NSObject, ObservableObject {
    @Published var isAuthorized = false
    @Published var deviceToken: String?
    
    static let shared = NotificationManager()
    
    func requestAuthorization() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .badge, .sound])
            
            await MainActor.run {
                self.isAuthorized = granted
            }
            
            if granted {
                await MainActor.run {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
            
            return granted
        } catch {
            return false
        }
    }
    
    func handleDeviceToken(_ token: Data) {
        let tokenString = token.map { String(format: "%02.2hhx", $0) }.joined()
        self.deviceToken = tokenString
        
        // Send to backend
        Task {
            await registerWithBackend(token: tokenString)
        }
    }
    
    private func registerWithBackend(token: String) async {
        guard let serverURL = UserDefaults.standard.string(forKey: "serverURL"),
              let url = URL(string: "\(serverURL)/api/devices/register") else {
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "device_token": token,
            "platform": "ios",
            "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        ]
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        do {
            let (_, _) = try await URLSession.shared.data(for: request)
            print("Device registered successfully")
        } catch {
            print("Failed to register device: \(error)")
        }
    }
}
```

---

## App Delegate Setup

```swift
import SwiftUI

@main
struct OnlineTrackerApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        NotificationManager.shared.handleDeviceToken(deviceToken)
    }
    
    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("Failed to register for remote notifications: \(error)")
    }
    
    // Handle notification when app is in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        return [.banner, .badge, .sound]
    }
    
    // Handle notification tap
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let userInfo = response.notification.request.content.userInfo
        
        if let monitorId = userInfo["monitor_id"] as? Int {
            // Navigate to monitor detail
            // You can use NotificationCenter or a shared state manager
            NotificationCenter.default.post(
                name: .navigateToMonitor,
                object: nil,
                userInfo: ["monitorId": monitorId]
            )
        }
    }
}

extension Notification.Name {
    static let navigateToMonitor = Notification.Name("navigateToMonitor")
}
```

---

## Testing Notes

1. **Simulator limitations**: Push notifications don't work in simulator. Use a physical device.
2. **Development vs Production**: Use sandbox APNs for development builds, production for App Store.
3. **Token refresh**: Device tokens can change. Always send the latest token on app launch.

---

## Backend Changes (Completed)

The following backend changes have been implemented:

1. **New database table**: `push_devices` - stores device tokens
2. **New API endpoints**: 
   - `POST /api/devices/register` - register device for push
   - `DELETE /api/devices/{token}` - unregister device
   - `GET /api/devices/count` - get registered device count
3. **New service**: `push_sender.py` using `aioapns` Python library
4. **Alerter extension**: Push added as third alert channel alongside webhook and email
5. **New settings**: Push notification configuration in Settings page

### APNs Configuration (Server-Side)

The server admin needs to configure these settings:
- `push_alerts_enabled`: Enable/disable push notifications
- `apns_key_path`: Path to the .p8 key file on the server
- `apns_key_id`: Key ID from Apple Developer portal
- `apns_team_id`: Team ID from Apple Developer portal
- `apns_bundle_id`: Your app's bundle identifier
- `apns_use_sandbox`: Use sandbox (dev) or production APNs

---

## Summary

This specification provides everything needed to build the OnlineTracker iOS app:

- Complete API documentation with request/response examples
- Ready-to-use Swift Codable models
- Push notification setup guide
- App architecture recommendations
- Example code for API client and notification handling
- UI requirements and color scheme

The app is straightforward to build with SwiftUI and modern async/await patterns.
