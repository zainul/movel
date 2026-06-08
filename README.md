# Movel AI — ROS Plugin Integration POC

## Technology Stack

| Service | Language | Key Libraries |
|---|---|---|
| ROS Plugin | Go 1.21 | gorilla/websocket |
| Cloud Backend | Go 1.21 | gorilla/websocket, net/http |
| Frontend | TypeScript + React 18 | Vite, Canvas API |

Each service runs in its own Docker container.
The plugin acts as the WebSocket **client**; the backend is the **server**.

**Why WebSocket:**
- Bidirectional on a single connection — telemetry flows in, commands flow out
- Plugin initiates the connection, so the backend needs no knowledge of the robot's address
- Low latency for command delivery compared to polling
- Easy to detect disconnection and trigger reconnect logic on the plugin side

**Trade-offs:**
- More complex than plain HTTP polling
- State must be managed carefully (who holds the connection, what happens on reconnect)
- Only one plugin connection is tracked (last-write-wins for this POC)

**Reconnect behavior:**
- Plugin retries connection every 3 seconds on failure
- Backend marks `plugin_connected: false` when connection drops
- No message queuing — commands sent while disconnected are dropped (acceptable for real-time control)

Run
docker compose up --build -d

Open the UI
http://localhost:3000
