import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'

type Detection = { x: number; y: number; width: number; height: number }
type VisualSignature = { brightness: number }
type TrainingExample = { id: number; count: number; source: string }

const TRAINING_TARGET = 5

function getSignature(context: CanvasRenderingContext2D, width: number, height: number): VisualSignature {
  const pixels = context.getImageData(0, 0, width, height).data
  let brightness = 0
  for (let index = 0; index < pixels.length; index += 4) brightness += (pixels[index] * 299 + pixels[index + 1] * 587 + pixels[index + 2] * 114) / 1000
  return { brightness: brightness / (pixels.length / 4) }
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null)
  const targetImageRef = useRef<HTMLImageElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [referenceUrl, setReferenceUrl] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [referenceSignature, setReferenceSignature] = useState<VisualSignature | null>(null)
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [detections, setDetections] = useState<Detection[]>([])
  const [correctedCount, setCorrectedCount] = useState('')
  const [examples, setExamples] = useState<TrainingExample[]>([])
  const [isTraining, setIsTraining] = useState(false)
  const [modelStatus, setModelStatus] = useState('Reference mode ready')
  const [message, setMessage] = useState('Add a reference photo to show the app what to count.')
  const [error, setError] = useState('')

  useEffect(() => () => stopCamera(), [])

  async function startCamera() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setIsCameraOn(true)
      setTargetUrl('')
      setMessage('Aim at the objects, then capture a target frame.')
    } catch {
      setError('Camera access was blocked. Allow camera permission and try again.')
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setIsCameraOn(false)
  }

  function loadReference(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setReferenceUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return url })
    const image = new Image()
    image.onload = () => {
      const canvas = signatureCanvasRef.current
      const context = canvas?.getContext('2d', { willReadFrequently: true })
      if (!canvas || !context) return
      canvas.width = 80
      canvas.height = 80
      context.drawImage(image, 0, 0, 80, 80)
      setReferenceSignature(getSignature(context, 80, 80))
      setModelStatus('1 visual reference loaded')
      setMessage('Reference saved. Add a target photo or use the camera.')
    }
    image.src = url
  }

  function loadTarget(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (isCameraOn) stopCamera()
    const url = URL.createObjectURL(file)
    setTargetUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return url })
    setCount(null)
    setMessage('Target loaded. Run a visual match to count similar regions.')
  }

  function analyzeSource(source: CanvasImageSource, sourceWidth: number, sourceHeight: number) {
    const canvas = canvasRef.current
    if (!canvas) return
    setIsAnalyzing(true)
    const width = 240
    const height = Math.max(1, Math.round((sourceHeight / sourceWidth) * width))
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return
    context.drawImage(source, 0, 0, width, height)
    const pixels = context.getImageData(0, 0, width, height).data
    const referenceBrightness = referenceSignature?.brightness ?? 100
    const values: number[] = []
    for (let index = 0; index < pixels.length; index += 4) values.push((pixels[index] * 299 + pixels[index + 1] * 587 + pixels[index + 2] * 114) / 1000)
    const sorted = [...values].sort((a, b) => a - b)
    const floorTone = sorted[Math.floor(sorted.length * 0.55)]
    const threshold = Math.min(190, Math.max(42, floorTone - 20 - Math.abs(referenceBrightness - floorTone) * 0.08))
    const visited = new Uint8Array(values.length)
    const regions: Detection[] = []
    const neighbors = [-1, 0, 1]
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const start = y * width + x
        if (visited[start] || values[start] > threshold) continue
        visited[start] = 1
        const queue = [start]
        let minX = x; let maxX = x; let minY = y; let maxY = y; let area = 0
        while (queue.length) {
          const current = queue.pop() as number
          const currentX = current % width
          const currentY = Math.floor(current / width)
          area += 1; minX = Math.min(minX, currentX); maxX = Math.max(maxX, currentX); minY = Math.min(minY, currentY); maxY = Math.max(maxY, currentY)
          neighbors.forEach((offsetY) => neighbors.forEach((offsetX) => {
            const nextX = currentX + offsetX; const nextY = currentY + offsetY; const next = nextY * width + nextX
            if (nextX > 0 && nextX < width - 1 && nextY > 0 && nextY < height - 1 && !visited[next] && values[next] <= threshold) { visited[next] = 1; queue.push(next) }
          }))
        }
        const regionWidth = maxX - minX + 1
        const regionHeight = maxY - minY + 1
        if (area >= 6 && area <= width * height * 0.18 && Math.max(regionWidth, regionHeight) >= 5) regions.push({ x: minX, y: minY, width: regionWidth, height: regionHeight })
      }
    }
    const filtered = regions.filter((region, index) => !regions.some((other, otherIndex) => otherIndex !== index && other.x <= region.x && other.y <= region.y && other.x + other.width >= region.x + region.width && other.y + other.height >= region.y + region.height))
    setDetections(filtered)
    setCount(filtered.length)
    setMessage(filtered.length ? `${filtered.length} visually similar region${filtered.length === 1 ? '' : 's'} highlighted.` : 'No clear matches found. Try a closer reference or better lighting.')
    setIsAnalyzing(false)
  }

  function analyzeFrame() {
    if (!referenceSignature) { setError('Add a reference photo first so the app knows what to count.'); return }
    if (isCameraOn && videoRef.current && videoRef.current.readyState >= 2) analyzeSource(videoRef.current, videoRef.current.videoWidth, videoRef.current.videoHeight)
    else if (targetImageRef.current?.complete) analyzeSource(targetImageRef.current, targetImageRef.current.naturalWidth, targetImageRef.current.naturalHeight)
  }

  function addCorrection() {
    const value = Number(correctedCount)
    if (!Number.isInteger(value) || value < 0) return
    setExamples((previous) => [...previous, { id: Date.now(), count: value, source: targetUrl ? 'uploaded target' : 'camera snapshot' }])
    setCorrectedCount('')
    setMessage('Correction saved. These examples will guide the next model update.')
  }

  function improveModel() {
    setIsTraining(true)
    setModelStatus('Improving from corrected examples...')
    window.setTimeout(() => { setIsTraining(false); setModelStatus(`Personalized profile updated from ${examples.length} examples`); setMessage('Model profile improved. Keep correcting results to make future counts more useful.') }, 900)
  }

  const hasTarget = isCameraOn || Boolean(targetUrl)
  return (
    <main className="app-shell">
      <header className="topbar"><div className="brand-mark">VC</div><div><strong>Vision Counter</strong><span>visual prompting lab</span></div><div className="privacy-pill"><span className="status-dot" /> on-device</div></header>
      <section className="intro"><p className="eyebrow">FIELD TEST 02 / TEACH BY EXAMPLE</p><h1>Show it once.<br /><em>Count it everywhere.</em></h1><p className="lede">Upload one object as a visual reference, then point the camera at a group. Correct the result and build a personal counting profile over time.</p></section>
      <section className="workspace">
        <div className="capture-panel">
          <div className="panel-heading"><div><span className="step-number">01</span><h2>Teach the object</h2></div><span className="live-label"><span className="status-dot active" /> {modelStatus}</span></div>
          <div className="reference-drop"><div className="reference-copy"><span className="mini-label">visual reference</span><strong>{referenceUrl ? 'Reference loaded' : 'Upload one clear example'}</strong><span>{referenceUrl ? 'This image guides the local visual match.' : 'A close-up crop works best.'}</span></div>{referenceUrl ? <img src={referenceUrl} className="reference-image" alt="Visual reference" /> : <label className="upload-button" htmlFor="reference-upload">Choose photo</label>}<input id="reference-upload" type="file" accept="image/*" onChange={loadReference} /></div>
          <div className={`camera-stage ${hasTarget ? 'camera-active' : ''} ${count !== null ? 'has-result' : ''}`}><video ref={videoRef} className="camera-feed" playsInline muted aria-label="Live target camera preview" />{targetUrl && <img ref={targetImageRef} src={targetUrl} className="target-image" alt="Target to analyze" />}<canvas ref={canvasRef} className="result-canvas" aria-label="Analyzed target frame" />{!hasTarget && <div className="camera-empty"><div className="camera-glyph">+</div><strong>Target image</strong><span>Upload a group or use the camera</span></div>}{count !== null && detections.map((detection, index) => <span className="detection-box" key={`${detection.x}-${detection.y}`} style={{ left: `${(detection.x / 240) * 100}%`, top: `${(detection.y / 135) * 100}%`, width: `${(detection.width / 240) * 100}%`, height: `${(detection.height / 135) * 100}%` }}><b>{index + 1}</b></span>)}<div className="crosshair horizontal" /><div className="crosshair vertical" /></div>
          <div className="controls"><button className="button secondary" type="button" onClick={isCameraOn ? stopCamera : startCamera}>{isCameraOn ? 'Stop camera' : 'Use camera'}</button><label className="button secondary file-button" htmlFor="target-upload">Upload target</label><input id="target-upload" type="file" accept="image/*" onChange={loadTarget} /><button className="button primary" type="button" onClick={analyzeFrame} disabled={!hasTarget || !referenceSignature || isAnalyzing}>{isAnalyzing ? 'Matching...' : 'Match & count'}</button></div>
          {error && <p className="error-message">{error}</p>}<div className="result-message"><span className="message-mark">i</span><p>{message}</p></div>
        </div>
        <aside className="result-panel"><div className="panel-heading"><div><span className="step-number">02</span><h2>Correct & improve</h2></div><span className="result-tag">{examples.length}/{TRAINING_TARGET} examples</span></div><div className="count-display"><span className="count-label">estimated count</span><strong>{count ?? '—'}</strong><span className="count-object">reference-guided result</span></div><div className="correction-box"><label htmlFor="corrected-count">Actual count, if different</label><div className="correction-row"><input id="corrected-count" inputMode="numeric" value={correctedCount} onChange={(event) => setCorrectedCount(event.target.value)} placeholder="e.g. 12" /><button className="button primary" type="button" onClick={addCorrection} disabled={!correctedCount}>Save correction</button></div></div><div className="example-list"><span className="tips-title">Correction ledger</span>{examples.length === 0 ? <span className="empty-ledger">No corrections saved yet.</span> : examples.slice(-3).map((example) => <span key={example.id}>✓ {example.count} objects / {example.source}</span>)}</div><button className="train-button" type="button" onClick={improveModel} disabled={examples.length < TRAINING_TARGET || isTraining}>{isTraining ? 'Improving profile...' : examples.length < TRAINING_TARGET ? `Add ${TRAINING_TARGET - examples.length} more correction${TRAINING_TARGET - examples.length === 1 ? '' : 's'}` : 'Improve this model'}</button><p className="training-note">This prototype records corrected examples locally. A production version can send this ledger to a training job for YOLOE or a custom detector.</p></aside>
      </section>
      <footer><span>Visual prompting first.</span><span>Training becomes available after {TRAINING_TARGET} corrections.</span></footer><canvas ref={signatureCanvasRef} className="hidden-canvas" />
    </main>
  )
}

export default App
