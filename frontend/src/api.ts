const BASE = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8080'

export interface RobotState {
  robot_id: string
  position: { x: number; y: number }
  battery_percentage: number
  last_updated_at: string
}

export interface HealthState {
  status: string
  plugin_connected: boolean
  last_telemetry_at: string | null
}

export async function fetchRobotState(): Promise<RobotState> {
  const res = await fetch(`${BASE}/api/robot/state`)
  if (!res.ok) throw new Error(`state fetch failed: ${res.status}`)
  return res.json()
}

export async function fetchHealth(): Promise<HealthState> {
  const res = await fetch(`${BASE}/health`)
  if (!res.ok) throw new Error(`health fetch failed: ${res.status}`)
  return res.json()
}

export async function sendCommand(command: string): Promise<void> {
  const res = await fetch(`${BASE}/api/robot/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `command failed: ${res.status}`)
  }
}
