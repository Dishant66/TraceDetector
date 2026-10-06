import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../ui/Icon.jsx'
import { ACCEPT_ATTR, ACCEPTED_LABEL, MAX_FILE_BYTES, formatBytes } from '../../utils/file.js'

export default function Dropzone({ onFile, disabled = false }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  const handleFiles = useCallback(
    (fileList) => {
      const files = Array.from(fileList || [])
      if (!files.length) {
        onFile(null, 'No file was detected. Try choosing the image again.')
        return
      }
      if (files.length > 1) {
        onFile(files[0], null, 'Only the first image was taken — TraceDetector analyses one image at a time.')
        return
      }
      onFile(files[0])
    },
    [onFile],
  )

  // Paste-to-analyse: the fastest path from "screenshot" to "checked".
  useEffect(() => {
    if (disabled) return undefined
    const onPaste = (event) => {
      const items = Array.from(event.clipboardData?.files || [])
      if (items.length) {
        event.preventDefault()
        handleFiles(items)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleFiles, disabled])

  const onDrop = (event) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (disabled) return
    handleFiles(event.dataTransfer?.files)
  }

  return (
    <div
      className="dropzone"
      data-dragging={dragging}
      data-disabled={disabled}
      onDragEnter={(e) => {
        e.preventDefault()
        dragDepth.current += 1
        if (!disabled) setDragging(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault()
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={ACCEPT_ATTR}
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />

      <div className="dropzone-inner">
        <span className="dropzone-icon">
          <Icon name="upload" size={26} strokeWidth={1.6} />
        </span>

        <h3>Drag &amp; drop your image here</h3>
        <p className="dropzone-sub">
          or <button type="button" className="link-button" onClick={() => inputRef.current?.click()} disabled={disabled}>browse your files</button>{' '}
          — you can also paste a screenshot with <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>V</kbd>
        </p>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          <Icon name="image" size={16} />
          Choose an image
        </button>

        <ul className="dropzone-meta">
          <li>
            <Icon name="file" size={14} />
            {ACCEPTED_LABEL}
          </li>
          <li>
            <Icon name="database" size={14} />
            Up to {formatBytes(MAX_FILE_BYTES)}
          </li>
          <li>
            <Icon name="lock" size={14} />
            Never stored
          </li>
        </ul>
      </div>

      <div className="dropzone-overlay" aria-hidden="true">
        <Icon name="scan" size={28} />
        Drop to load the image
      </div>
    </div>
  )
}
