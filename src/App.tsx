import { useEffect, useRef, useState } from 'react'
import './App.css'

type Detection = { x: number; y: number; width: number; height: number }

const objectOptions = ['Toothpicks', 'Coins', 'Small pills']

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [objectType, setObjectType] = useState('Toothpicks')
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [detections, setDetections] = useState<Detection[]>([])
  const [message, setMessage] = useState('Camera is ready when you are.')
  const [error, setError] = useState('')

  useEffect(() => () => stopCamera(), [])

  async function startCamera() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setIsCameraOn(true)
      setMessage('Aim straight down, then capture the frame.')
    } catch {
      setError('Camera access was blocked. Allow camera permission and try again.')
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setIsCameraOn(false)
  }

  function analyzeFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return

    setIsAnalyzing(true)
    setError('')
    const width = 240
    const height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * width))
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return
    context.drawImage(video, 0, 0, width, height)

    const image = context.getImageData(0, 0, width, height)
    const values: number[] = []
    for (let index = 0; index < image.data.length; index += 4) {
      values.push((image.data[index] * 299 + image.data[index + 1] * 587 + image.data[index + 2] * 114) / 1000)
    }
    const sorted = [...values].sort((a, b) => a - b)
    const floorTone = sorted[Math.floor(sorted.length * 0.55)]
    const threshold = Math.min(180, Math.max(55, floorTone - 24))
    const visited = new Uint8Array(values.length)
    const regions: Detection[] = []
    const neighbors = [-1, 0, 1]

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const start = y * width + x
        if (visited[start] || values[start] > threshold) continue
        visited[start] = 1
        const queue = [start]
        let minX = x
        let maxX = x
        let minY = y
        let maxY = y
        let area = 0
        while (queue.length) {
          const current = queue.pop() as number
          const currentX = current % width
          const currentY = Math.floor(current / width)
          area += 1
          minX = Math.min(minX, currentX)
          maxX = Math.max(maxX, currentX)
          minY = Math.min(minY, currentY)
          maxY = Math.max(maxY, currentY)
          neighbors.forEach((offsetY) => neighbors.forEach((offsetX) => {
            const nextX = currentX + offsetX
            const nextY = currentY + offsetY
            const next = nextY * width + nextX
            if (nextX > 0 && nextX < width - 1 && nextY > 0 && nextY < height - 1 && !visited[next] && values[next] <= threshold) {
              visited[next] = 1
              queue.push(next)
            }
          }))
        }
        const regionWidth = maxX - minX + 1
        const regionHeight = maxY - minY + 1
        if (area >= 6 && area <= width * height * 0.18 && Math.max(regionWidth, regionHeight) >= 5) {
          regions.push({ x: minX, y: minY, width: regionWidth, height: regionHeight })
        }
      }
    }

    const filtered = regions.filter((region, index) => !regions.some((other, otherIndex) => otherIndex !== index && other.x <= region.x && other.y <= region.y && other.x + other.width >= region.x + region.width && other.y + other.height >= region.y + region.height))
    setDetections(filtered)
    setCount(filtered.length)
    setMessage(filtered.length ? 'Regions highlighted in the frame.' : 'No clear regions found. Try brighter, even lighting.')
    setIsAnalyzing(false)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">VC</div>
        <div><strong>Vision Counter</strong><span>camera-based object counting</span></div>
        <div className="privacy-pill"><span className="status-dot" /> on-device</div>
      </header>

      <section className="intro">
        <p className="eyebrow">FIELD TEST 01 / QUICK COUNT</p>
        <h1>How many are<br /><em>in the frame?</em></h1>
        <p className="lede">Point your phone down at a clear surface. Vision Counter finds distinct shapes in one snapshot, right in your browser.</p>
      </section>

      <section className="workspace">
        <div className="capture-panel">
          <div className="panel-heading"><div><span className="step-number">01</span><h2>Set the scene</h2></div><span className="live-label"><span className={`status-dot ${isCameraOn ? 'active' : ''}`} /> {isCameraOn ? 'live camera' : 'waiting'}</span></div>
          <div className={`camera-stage ${isCameraOn ? 'camera-active' : ''} ${count !== null ? 'has-result' : ''}`}>
            <video ref={videoRef} className="camera-feed" playsInline muted aria-label="Live camera preview" />
            <canvas ref={canvasRef} className="result-canvas" aria-label="Analyzed camera frame" />
            {!isCameraOn && <div className="camera-empty"><div className="camera-glyph">+</div><strong>Camera preview</strong><span>Permission stays in your browser</span></div>}
            {count !== null && detections.map((detection, index) => <span className="detection-box" key={`${detection.x}-${detection.y}`} style={{ left: `${(detection.x / 240) * 100}%`, top: `${(detection.y / 135) * 100}%`, width: `${(detection.width / 240) * 100}%`, height: `${(detection.height / 135) * 100}%` }}><b>{index + 1}</b></span>)}
            <div className="crosshair horizontal" /><div className="crosshair vertical" />
          </div>
          <div className="controls"><button className="button secondary" type="button" onClick={isCameraOn ? stopCamera : startCamera}>{isCameraOn ? 'Stop camera' : 'Allow camera'}</button><button className="button primary" type="button" onClick={analyzeFrame} disabled={!isCameraOn || isAnalyzing}>{isAnalyzing ? 'Analyzing...' : 'Capture & count'}</button></div>
          {error && <p className="error-message">{error}</p>}
        </div>

        <aside className="result-panel">
          <div className="panel-heading"><div><span className="step-number">02</span><h2>Read the result</h2></div><span className="result-tag">snapshot</span></div>
          <div className="count-display"><span className="count-label">estimated count</span><strong>{count ?? '—'}</strong><span className="count-object">{count === null ? 'waiting for a frame' : objectType.toLowerCase()}</span></div>
          <div className="result-message"><span className="message-mark">i</span><p>{message}</p></div>
          <label className="select-label" htmlFor="object-type">What are you counting?</label>
          <select id="object-type" value={objectType} onChange={(event) => setObjectType(event.target.value)}>{objectOptions.map((option) => <option key={option}>{option}</option>)}</select>
          <div className="tips"><span className="tips-title">Better counts</span><span>Use a contrasting surface</span><span>Keep objects separated</span><span>Fill most of the frame</span></div>
        </aside>
      </section>

      <footer><span>Designed for quick, approximate counts.</span><span>Works best with high-contrast objects.</span></footer>
    </main>
  )
}

export default App
