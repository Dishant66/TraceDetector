import { useState } from 'react'
import Icon from '../ui/Icon.jsx'
import RiskSummary from './RiskSummary.jsx'
import ImageFindings from './ImageFindings.jsx'
import FindingsPanel from './FindingsPanel.jsx'
import PrivacyChecklist from './PrivacyChecklist.jsx'
import DetailsPanel from './DetailsPanel.jsx'
import { downloadHtmlReport, downloadJsonReport } from '../../services/reportService.js'

export default function ResultsView({ analysis, onAnalyzeAnother, onClear }) {
  const [activeId, setActiveId] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const handleReport = async () => {
    setExporting(true)
    setExportError('')
    try {
      await downloadHtmlReport(analysis)
    } catch {
      setExportError('The report could not be generated. Try the JSON export instead.')
    } finally {
      setExporting(false)
    }
  }

  const handleJson = () => {
    setExportError('')
    try {
      downloadJsonReport(analysis)
    } catch {
      setExportError('The JSON export failed in this browser.')
    }
  }

  return (
    <div className="results">
      <div className="results-actions">
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={onAnalyzeAnother}>
            <Icon name="upload" size={16} />
            Analyze another image
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleReport} disabled={exporting}>
            <Icon name="download" size={16} />
            {exporting ? 'Preparing report…' : 'Download report'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleJson}>
            <Icon name="code" size={16} />
            Export JSON
          </button>
          <button type="button" className="btn btn-quiet" onClick={onClear}>
            <Icon name="trash" size={15} />
            Clear analysis
          </button>
        </div>
        {exportError && (
          <div className="notice notice-error">
            <Icon name="alert" size={16} />
            <span>{exportError}</span>
          </div>
        )}
      </div>

      <RiskSummary analysis={analysis} />

      <div className="results-grid">
        <ImageFindings analysis={analysis} activeId={activeId} onActivate={setActiveId} />
        <FindingsPanel analysis={analysis} activeId={activeId} onActivate={setActiveId} />
      </div>

      <PrivacyChecklist checklist={analysis.checklist} />

      <DetailsPanel analysis={analysis} />

      <p className="results-footnote">
        <Icon name="info" size={14} />
        Report generated {new Date(analysis.createdAt).toLocaleString()} · TraceDetector keeps no
        copy of your image or this analysis. Refreshing the page clears everything.
      </p>
    </div>
  )
}
