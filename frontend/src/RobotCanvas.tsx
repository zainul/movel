import { useEffect, useRef } from 'react'

interface Props {
  x: number
  y: number
  stale: boolean
}

const GRID = 40
const WORLD_RANGE = 10  // -10 to +10 units

export default function RobotCanvas({ x, y, stale }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const W = canvas.width
    const H = canvas.height
    const cx = W / 2
    const cy = H / 2
    const scale = (W / 2) / WORLD_RANGE  // pixels per unit

    ctx.clearRect(0, 0, W, H)

    // Background
    ctx.fillStyle = '#0a0c0f'
    ctx.fillRect(0, 0, W, H)

    // Grid lines
    const gridStep = scale  // 1 unit = scale pixels
    ctx.strokeStyle = '#1a2530'
    ctx.lineWidth = 1
    for (let gx = cx % gridStep; gx < W; gx += gridStep) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke()
    }
    for (let gy = cy % gridStep; gy < H; gy += gridStep) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke()
    }

    // Axis lines
    ctx.strokeStyle = '#1e3040'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke()

    // Origin marker
    ctx.strokeStyle = '#2a3a4a'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(cx, cy, 4, 0, Math.PI * 2)
    ctx.stroke()

    // Convert world coords to canvas coords (y flipped)
    const px = cx + x * scale
    const py = cy - y * scale

    // Robot trail / glow
    const color = stale ? '#ff9500' : '#00d4ff'
    const glowColor = stale ? 'rgba(255,149,0,0.15)' : 'rgba(0,212,255,0.12)'

    // Outer glow
    const grad = ctx.createRadialGradient(px, py, 0, px, py, 28)
    grad.addColorStop(0, glowColor)
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(px, py, 28, 0, Math.PI * 2)
    ctx.fill()

    // Robot body
    ctx.beginPath()
    ctx.arc(px, py, 10, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()

    // Inner dot
    ctx.beginPath()
    ctx.arc(px, py, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#0a0c0f'
    ctx.fill()

    // Crosshair
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(px - 20, py); ctx.lineTo(px + 20, py); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(px, py - 20); ctx.lineTo(px, py + 20); ctx.stroke()
    ctx.setLineDash([])

    // Coord label
    ctx.fillStyle = color
    ctx.font = '11px "Share Tech Mono", monospace'
    ctx.fillText(`(${x.toFixed(1)}, ${y.toFixed(1)})`, px + 14, py - 14)

  }, [x, y, stale])

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={400}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}
