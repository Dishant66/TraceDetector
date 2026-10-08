import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../components/ui/Icon.jsx'
import Dropzone from '../components/analyze/Dropzone.jsx'
import ImagePreviewCard from '../components/analyze/ImagePreviewCard.jsx'
import EngineSelector from '../components/analyze/EngineSelector.jsx'
import AnalysisProgress from '../components/analyze/AnalysisProgress.jsx'
import ResultsView from '../components/results/ResultsView.jsx'
import { runAnalysis, STAGES, ENGINES } from '../services/analysisService.js'
import { validateImageFile, readAsDataUrl, loadImageElement } from '../utils/file.js'
import { DEMO_IMAGE } from '../data/demoReport.js'

const HARD_TIMEOUT_MS = 95_000

export default function AnalyzePage({ aiStatus, demoRequest = 0, onDemoStarted }) {
  const [image, setImage] = useState(null) // { file, dataUrl, name, size, type, width, height }
  // `null` = follow the best engine the server offers; a string = explicit user choice.
  const [engineChoice, setEngineChoice] = useState(null)
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [stageIndex, setStageIndex] = useState(0)
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState(null) // { message, code }
  const [warning, setWarning] = useState('')

  const engine = engineChoice ?? (aiStatus?.aiConfigured ? 'ai' : 'local')

  const runToken = useRef(0)
  const lastDemoRequest = useRef(0)
  const topRef = useRef(null)

  const start = useCallback(
    async (mode, payload) => {
      const token = ++runToken.current
      setStatus('running')
      setStageIndex(0)
      setError(null)
      setAnalysis(null)

      const timeout = setTimeout(() => {
        if (runToken.current !== token) return
        runToken.current += 1
        setStatus('error')
        setError({
          code: 'timeout',
          message: 'The analysis took too long and was stopped. Try again, or use the On-Device Scan.',
        })
      }, HARD_TIMEOUT_MS)

      try {
        const result = await runAnalysis({
          mode,
          file: payload?.file,
          dataUrl: payload?.dataUrl,
          onStage: (id) => {
            if (runToken.current !== token) return
            const index = STAGES.findIndex((s) => s.id === id)
            if (index >= 0) setStageIndex((current) => Math.max(current, index))
          },
        })
        if (runToken.current !== token) return
        clearTimeout(timeout)
        setAnalysis(result)
        setStatus('done')
      } catch (err) {
        if (runToken.current !== token) return
        clearTimeout(timeout)
        setStatus('error')
        setError({
          code: err?.code || 'analysis_failed',
          message:
            err?.message ||
            'The analysis could not be completed. Please try again with a different image.',
        })
      }
    },
    [],
  )

  const runDemo = useCallback(() => {
    setWarning('')
    setEngineChoice('demo')
    start('demo')
  }, [start])

  // Demo launched from the landing page (this page may mount after the click).
  useEffect(() => {
    if (!demoRequest || demoRequest === lastDemoRequest.current) return
    lastDemoRequest.current = demoRequest
    runDemo()
    onDemoStarted?.()
  }, [demoRequest, runDemo, onDemoStarted])

  // Keep the staged loader moving even if one stage is slow.
  useEffect(() => {
    if (status !== 'running') return undefined
    const timer = setInterval(() => {
      setStageIndex((current) => Math.min(current + 1, STAGES.length - 2))
    }, 1100)
    return () => clearInterval(timer)
  }, [status])

  useEffect(() => {
    if (status === 'done' || status === 'error') {
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [status])

  const handleFile = useCallback(
    async (file, failureMessage, note) => {
      setWarning(note || '')
      if (!file) {
        setError({ code: 'empty', message: failureMessage || 'No image was selected.' })
        return
      }

      const check = validateImageFile(file)
      if (!check.ok) {
        setError({ code: check.code, message: check.message })
        return
      }

      setError(null)
      try {
        const dataUrl = await readAsDataUrl(file)
        let width = 0
        let height = 0
        try {
          const el = await loadImageElement(dataUrl)
          width = el.naturalWidth
          height = el.naturalHeight
        } catch {
          setError({
            code: 'decode_failed',
            message: 'That image could not be decoded. It may be corrupted — try re-exporting it.',
          })
          return
        }

        setImage({ file, dataUrl, name: file.name, size: file.size, type: file.type, width, height })
        setStatus('idle')
        setAnalysis(null)
      } catch (err) {
        setError({ code: 'read_failed', message: err?.message || 'The file could not be read.' })
      }
    },
    [],
  )

  const clearAll = () => {
    runToken.current += 1
    setImage(null)
    setAnalysis(null)
    setStatus('idle')
    setError(null)
    setWarning('')
    setStageIndex(0)
  }

  const analyzeAnother = () => {
    runToken.current += 1
    setAnalysis(null)
    setStatus('idle')
    setError(null)
    setStageIndex(0)
    if (engine === 'demo') {
      setImage(null)
      setEngineChoice(null)
    }
  }

  const cancel = () => {
    runToken.current += 1
    setStatus('idle')
    setStageIndex(0)
  }

  const canAnalyze = engine === 'demo' || Boolean(image)

  return (
    <div className="analyze">
      <span ref={topRef} />
      <div className="container analyze-inner">
        <header className="analyze-head">
          <span className="eyebrow">
            <Icon name="scan" size={13} />
            Image analysis
          </span>
          <h1 className="analyze-title">Check an image before you share it</h1>
          <p className="lede">
            Upload a screenshot or photo and TraceDetector will report what it reveals — visible
            details, hidden metadata and everything in between.
          </p>
        </header>

        {error && (
          <div className="notice notice-error analyze-alert" role="alert">
            <Icon name="alert" size={17} />
            <div>
              <strong>Analysis could not continue.</strong>{' '}
              <span className="analyze-alert-message">{error.message}</span>
              <div className="notice-actions">
                {image && engine !== 'local' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setEngineChoice('local')
                      start('local', { file: image.file, dataUrl: image.dataUrl })
                    }}
                  >
                    <Icon name="cpu" size={14} />
                    Run On-Device Scan instead
                  </button>
                )}
                {image && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => start(engine, { file: image.file, dataUrl: image.dataUrl })}
                  >
                    <Icon name="refresh" size={14} />
                    Try again
                  </button>
                )}
                <button type="button" className="btn btn-quiet btn-sm" onClick={runDemo}>
                  <Icon name="play" size={14} />
                  View demo analysis
                </button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setError(null)}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {warning && (
          <div className="notice notice-warn analyze-alert">
            <Icon name="info" size={16} />
            <span>{warning}</span>
          </div>
        )}

        {status === 'running' && (
          <AnalysisProgress
            stageIndex={stageIndex}
            engine={engine}
            imageUrl={engine === 'demo' ? DEMO_IMAGE.dataUrl : image?.dataUrl}
            onCancel={cancel}
          />
        )}

        {status === 'done' && analysis && (
          <ResultsView analysis={analysis} onAnalyzeAnother={analyzeAnother} onClear={clearAll} />
        )}

        {(status === 'idle' || status === 'error') && (
          <div className="upload-layout">
            <div className="upload-main">
              {image ? (
                <ImagePreviewCard
                  image={image}
                  onReplace={(file) => handleFile(file)}
                  onRemove={clearAll}
                  disabled={status === 'running'}
                />
              ) : (
                <Dropzone onFile={handleFile} disabled={status === 'running'} />
              )}

              <div className="privacy-explainer card card-pad">
                <Icon name="lock" size={18} />
                <div>
                  <strong>Your image is analyzed for potentially exposed information.</strong>
                  <p>
                    On-Device Scan reads the file entirely inside your browser. AI Analysis sends the
                    image to Google Gemini for one request and keeps no copy.
                    TraceDetector has no database — closing this tab erases everything.
                  </p>
                </div>
              </div>
            </div>

            <aside className="upload-side">
              <EngineSelector
                value={engine}
                onChange={setEngineChoice}
                aiStatus={aiStatus}
                disabled={status === 'running'}
              />

              <div className="run-panel card card-pad">
                <p className="run-summary">
                  <Icon name={engine === 'demo' ? 'play' : 'image'} size={15} />
                  {engine === 'demo'
                    ? 'Demo Analysis runs on a bundled mock screenshot — no upload needed.'
                    : image
                      ? `Ready to analyse ${image.name}`
                      : 'Add an image to enable analysis.'}
                </p>

                <button
                  type="button"
                  className="btn btn-primary btn-lg btn-block"
                  disabled={!canAnalyze}
                  onClick={() => start(engine, image ? { file: image.file, dataUrl: image.dataUrl } : undefined)}
                >
                  <Icon name="sparkle" size={17} />
                  {engine === 'demo' ? 'Run demo analysis' : `Analyze with ${ENGINES[engine].label}`}
                </button>

                {!aiStatus?.aiConfigured && engine !== 'demo' && (
                  <p className="run-hint">
                    <Icon name="info" size={13} />
                    AI Analysis requires a Gemini API key, which is not configured on this server. On-Device
                    Scan gives you real metadata, barcode and file-name findings right now.
                  </p>
                )}

                {engine === 'demo' && (
                  <p className="run-hint run-hint-warn">
                    <Icon name="alert" size={13} />
                    Demo results are authored sample data. They are not produced by an AI model and
                    do not describe your image.
                  </p>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
