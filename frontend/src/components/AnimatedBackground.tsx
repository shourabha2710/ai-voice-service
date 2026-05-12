import { useEffect, useRef } from 'react'

function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let w = window.innerWidth
    let h = window.innerHeight

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas!.width = w
      canvas!.height = h
    }
    resize()
    window.addEventListener('resize', resize)

    const count = Math.min(60, Math.floor((w * h) / 30000))
    const particles: Array<{ x: number; y: number; vx: number; vy: number; r: number; a: number }> = []
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.5,
        a: Math.random() * 0.3 + 0.1,
      })
    }

    const draw = () => {
      ctx!.clearRect(0, 0, w, h)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x = w
        if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h
        if (p.y > h) p.y = 0
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(124, 92, 255, ${p.a})`
        ctx!.fill()
      }
      animId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
    />
  )
}

export default function AnimatedBackground() {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid" />

        <div
          className="absolute rounded-full animate-float"
          style={{
            width: 600,
            height: 600,
            top: '-15%',
            left: '-10%',
            background: 'radial-gradient(circle, rgba(124,92,255,0.2), transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
        <div
          className="absolute rounded-full animate-float"
          style={{
            width: 500,
            height: 500,
            bottom: '-15%',
            right: '-10%',
            background: 'radial-gradient(circle, rgba(6,182,212,0.13), transparent 70%)',
            filter: 'blur(80px)',
            animationDelay: '-7s',
          }}
        />
        <div
          className="absolute rounded-full animate-float"
          style={{
            width: 400,
            height: 400,
            top: '40%',
            left: '50%',
            background: 'radial-gradient(circle, rgba(59,130,246,0.1), transparent 70%)',
            filter: 'blur(80px)',
            animationDelay: '-14s',
          }}
        />
      </div>

      <div className="pointer-events-none fixed inset-0 z-[1] bg-noise" />
      <Particles />
    </>
  )
}
