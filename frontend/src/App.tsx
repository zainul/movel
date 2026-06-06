import { useEffect, useRef, useState, useCallback } from 'react'
import { fetchRobotState, fetchHealth, sendCommand, RobotState, HealthState } from './api'
import RobotCanvas from './RobotCanvas'

const STALE_MS = 5000
const POLL_MS = 1000

function useTick(fn: () => void, ms: number) {
  useEffect(() => {
    fn()
    const id = setInterval(fn, ms)
    return () => clearInterval(id)
  }, [fn, ms])
}

function BatteryBar({ pct }: { pct: number }) {
  const color = pct > 50 ? 'var(--ok)' : pct > 20 ? 'var(--warn)' : 'var(--danger)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        flex: 1, height: 8, background: 'var(--border)',
        borderRadius: 2, overflow: 'hidden', border: '1px solid var(--border-hi)'
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: color,
          transition: 'width 0.4s ease',
          boxShadow: `0 0 8px ${color}`,
        }} />
      </div>
      <span style={{ fontFamily: 'var(--text-mono)', color, fontSize: 13, minWidth: 48 }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  )
}

function KeyHint({ k, active }: { k: string; active: boolean }) {
  return (
    <div style={{
      width: 36, height: 36,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: active ? 'var(--accent)' : 'var(--bg-card)',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border-hi)'}`,
      color: active ? '#0a0c0f' : 'var(--text-dim)',
      fontFamily: 'var(--text-mono)',
      fontSize: 14,
      fontWeight: 700,
      borderRadius: 4,
      transition: 'all 0.08s ease',
      boxShadow: active ? '0 0 12px var(--accent)' : 'none',
    }}>
      {k.toUpperCase()}
    </div>
  )
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: ok ? 'var(--ok)' : 'var(--danger)',
      boxShadow: ok ? '0 0 6px var(--ok)' : '0 0 6px var(--danger)',
      marginRight: 6,
    }} />
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: 'var(--text-mono)', fontSize: 10,
      color: 'var(--text-dim)', letterSpacing: '0.12em',
      textTransform: 'uppercase',
    }}>
      {children}
    </span>
  )
}

export default function App() {
  const [robot, setRobot] = useState<RobotState | null>(null)
  const [health, setHealth] = useState<HealthState | null>(null)
  const [stateError, setStateError] = useState<string | null>(null)
  const [cmdError, setCmdError] = useState<string | null>(null)
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set())
  const [lastCmdAt, setLastCmdAt] = useState<number | null>(null)

  const lastUpdateRef = useRef<number | null>(null)
  const [stale, setStale] = useState(false)

  // ── Polling ──
  const pollState = useCallback(async () => {
    try {
      const s = await fetchRobotState()
      setRobot(s)
      lastUpdateRef.current = Date.now()
      setStateError(null)
    } catch (e: any) {
      setStateError(e.message)
    }
  }, [])

  const pollHealth = useCallback(async () => {
    try {
      const h = await fetchHealth()
      setHealth(h)
    } catch {
      setHealth(null)
    }
  }, [])

  useTick(pollState, POLL_MS)
  useTick(pollHealth, POLL_MS * 3)

  // ── Stale detection ──
  useEffect(() => {
    const id = setInterval(() => {
      if (lastUpdateRef.current) {
        setStale(Date.now() - lastUpdateRef.current > STALE_MS)
      }
    }, 500)
    return () => clearInterval(id)
  }, [])

  // ── Keyboard control ──
  useEffect(() => {
    const VALID = new Set(['w', 'a', 's', 'd'])

    const handleDown = async (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (!VALID.has(key)) return
      e.preventDefault()

      setActiveKeys(prev => new Set(prev).add(key))
      setCmdError(null)
      try {
        await sendCommand(key)
        setLastCmdAt(Date.now())
      } catch (err: any) {
        setCmdError(err.message)
      }
    }

    const handleUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      setActiveKeys(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }

    window.addEventListener('keydown', handleDown)
    window.addEventListener('keyup', handleUp)
    return () => {
      window.removeEventListener('keydown', handleDown)
      window.removeEventListener('keyup', handleUp)
    }
  }, [])

  const pluginOk = health?.plugin_connected ?? false
  const systemOk = !stateError && pluginOk

  return (
    <div style={{
      height: '100vh', display: 'grid',
      gridTemplateRows: 'auto 1fr',
      gridTemplateColumns: '1fr 360px',
      gap: 0,
      background: 'var(--bg)',
    }}>

      {/* ── Header ── */}
      <header style={{
        gridColumn: '1 / -1',
        borderBottom: '1px solid var(--border)',
        padding: '12px 24px',
        display: 'flex', alignItems: 'center', gap: 24,
        background: 'var(--bg-panel)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28,
            background: 'var(--accent)', borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 14, color: '#0a0c0f', fontWeight: 900 }}>M</span>
          </div>
          <span style={{
            fontFamily: 'var(--text-mono)', fontSize: 13,
            color: 'var(--accent)', letterSpacing: '0.1em',
          }}>MOVEL AI</span>
          <span style={{ color: 'var(--border-hi)' }}>/</span>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: 13, color: 'var(--text-dim)' }}>
            ROBOT CONTROL v0.1
          </span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <StatusDot ok={pluginOk} />
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
              {pluginOk ? 'PLUGIN CONNECTED' : 'PLUGIN OFFLINE'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <StatusDot ok={!stale && robot !== null} />
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
              {stale ? 'TELEMETRY STALE' : robot ? 'TELEMETRY LIVE' : 'NO DATA'}
            </span>
          </div>
          {robot && (
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
              {robot.robot_id.toUpperCase()}
            </span>
          )}
        </div>
      </header>

      {/* ── Canvas area ── */}
      <main style={{
        position: 'relative',
        background: 'var(--bg)',
        border: 'none',
        overflow: 'hidden',
      }}>
        {stateError ? (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12,
          }}>
            <span style={{ fontFamily: 'var(--text-mono)', color: 'var(--danger)', fontSize: 13 }}>
              ⚠ BACKEND UNREACHABLE
            </span>
            <span style={{ fontFamily: 'var(--text-mono)', color: 'var(--text-dim)', fontSize: 11 }}>
              {stateError}
            </span>
          </div>
        ) : (
          <>
            <RobotCanvas
              x={robot?.position.x ?? 0}
              y={robot?.position.y ?? 0}
              stale={stale}
            />
            {stale && (
              <div style={{
                position: 'absolute', bottom: 16, left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(255,149,0,0.1)',
                border: '1px solid var(--warn)',
                color: 'var(--warn)',
                padding: '6px 16px',
                fontFamily: 'var(--text-mono)', fontSize: 11,
                letterSpacing: '0.1em',
              }}>
                ⚠ TELEMETRY STALE — NO UPDATE FOR {'>'}5s
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Right panel ── */}
      <aside style={{
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border)',
        padding: 24,
        display: 'flex', flexDirection: 'column', gap: 24,
        overflowY: 'auto',
      }}>

        {/* Position */}
        <section>
          <Label>Position</Label>
          <div style={{
            marginTop: 10, padding: 16,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 4,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {(['x', 'y'] as const).map(axis => (
                <div key={axis}>
                  <Label>{axis}</Label>
                  <div style={{
                    marginTop: 4,
                    fontFamily: 'var(--text-mono)', fontSize: 22, fontWeight: 400,
                    color: 'var(--accent)',
                  }}>
                    {(robot?.position[axis] ?? 0).toFixed(2)}
                  </div>
                  <span style={{ fontFamily: 'var(--text-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                    units
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Battery */}
        <section>
          <Label>Battery</Label>
          <div style={{
            marginTop: 10, padding: 16,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 4,
          }}>
            <BatteryBar pct={robot?.battery_percentage ?? 0} />
          </div>
        </section>

        {/* Keyboard */}
        <section>
          <Label>Movement Control</Label>
          <div style={{
            marginTop: 10, padding: 16,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 4,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '36px 36px 36px', gap: 4, justifyContent: 'center' }}>
              <div />
              <KeyHint k="w" active={activeKeys.has('w')} />
              <div />
              <KeyHint k="a" active={activeKeys.has('a')} />
              <KeyHint k="s" active={activeKeys.has('s')} />
              <KeyHint k="d" active={activeKeys.has('d')} />
            </div>
            <div style={{
              marginTop: 12, textAlign: 'center',
              fontFamily: 'var(--text-mono)', fontSize: 10,
              color: 'var(--text-dim)',
            }}>
              USE KEYBOARD TO MOVE ROBOT
            </div>
          </div>

          {cmdError && (
            <div style={{
              marginTop: 8, padding: '8px 12px',
              background: 'rgba(255,59,59,0.08)',
              border: '1px solid var(--danger)',
              borderRadius: 4,
              fontFamily: 'var(--text-mono)', fontSize: 11,
              color: 'var(--danger)',
            }}>
              ✗ {cmdError}
            </div>
          )}

          {lastCmdAt && !cmdError && (
            <div style={{
              marginTop: 8,
              fontFamily: 'var(--text-mono)', fontSize: 10,
              color: 'var(--text-dim)',
              textAlign: 'right',
            }}>
              last cmd: {new Date(lastCmdAt).toLocaleTimeString()}
            </div>
          )}
        </section>

        {/* Telemetry */}
        <section>
          <Label>Last Telemetry</Label>
          <div style={{
            marginTop: 10, padding: 12,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            fontFamily: 'var(--text-mono)', fontSize: 10,
            color: 'var(--text-dim)',
            lineHeight: 1.8,
          }}>
            {robot ? (
              <>
                <div>robot_id: <span style={{ color: 'var(--text)' }}>{robot.robot_id}</span></div>
                <div>updated: <span style={{ color: 'var(--text)' }}>
                  {new Date(robot.last_updated_at).toLocaleTimeString()}
                </span></div>
                <div>status: <span style={{ color: systemOk ? 'var(--ok)' : 'var(--warn)' }}>
                  {systemOk ? 'nominal' : stale ? 'stale' : 'degraded'}
                </span></div>
              </>
            ) : (
              <span style={{ color: 'var(--text-dim)' }}>waiting for data...</span>
            )}
          </div>
        </section>

        {/* Health */}
        {health && (
          <section>
            <Label>System Health</Label>
            <div style={{
              marginTop: 10, padding: 12,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              fontFamily: 'var(--text-mono)', fontSize: 10,
              color: 'var(--text-dim)',
              lineHeight: 1.8,
            }}>
              <div>backend: <span style={{ color: 'var(--ok)' }}>{health.status}</span></div>
              <div>plugin: <span style={{ color: health.plugin_connected ? 'var(--ok)' : 'var(--danger)' }}>
                {health.plugin_connected ? 'connected' : 'disconnected'}
              </span></div>
            </div>
          </section>
        )}
      </aside>
    </div>
  )
}
