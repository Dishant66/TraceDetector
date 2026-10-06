import { useRef } from 'react'
import Icon from '../ui/Icon.jsx'
import { ACCEPT_ATTR, formatBytes, truncateName } from '../../utils/file.js'

export default function ImagePreviewCard({ image, onReplace, onRemove, disabled }) {
  const inputRef = useRef(null)

  return (
    <div className="preview-card-wrap card card-pad">
      <div className="preview-media">
        <img src={image.dataUrl} alt={`Preview of ${image.name}`} />
      </div>

      <div className="preview-info">
        <div className="preview-info-head">
          <Icon name="image" size={16} />
          <strong title={image.name}>{truncateName(image.name)}</strong>
        </div>
        <ul className="preview-facts">
          <li>
            <span>Size</span>
            {formatBytes(image.size)}
          </li>
          <li>
            <span>Type</span>
            {(image.type || '').replace('image/', '').toUpperCase() || 'Unknown'}
          </li>
          <li>
            <span>Dimensions</span>
            {image.width && image.height ? `${image.width} × ${image.height}` : 'Reading…'}
          </li>
        </ul>

        <div className="btn-row">
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept={ACCEPT_ATTR}
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) onReplace(file)
            }}
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => inputRef.current?.click()} disabled={disabled}>
            <Icon name="refresh" size={14} />
            Replace image
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={onRemove} disabled={disabled}>
            <Icon name="trash" size={14} />
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}
