import React, { useState } from 'react'
import UploadForm from './UploadForm'
import Result from './Result'
import { resolveAnalysisMode } from './analysis'

const ANALYSIS_MODE = resolveAnalysisMode({
  geminiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
  n8nWebhook: import.meta.env.VITE_N8N_WEBHOOK_URL || '',
})

export default function App() {
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  return (
    <div className="app-shell">
      <div className="workspace">
        <header className="brand-header">
          <div className="brand-heading">
            <div className="brand-title">ATS <span>RESUME SCREENING</span></div>
            <div className={`brand-workflow-badge ${ANALYSIS_MODE === 'unconfigured' ? 'status-unconfigured' : ''}`} role="status">
              <span aria-hidden="true">{ANALYSIS_MODE === 'unconfigured' ? '!' : '●'}</span>
              {ANALYSIS_MODE === 'gemini' ? 'N8N AUTOMATED' : ANALYSIS_MODE === 'n8n' ? 'N8N AUTOMATED' : 'AI ANALYSIS NOT CONFIGURED'}
            </div>
          </div>
        </header>
        <main className="main-content">
          {!result ? (
            <UploadForm
              loading={loading}
              setLoading={setLoading}
              setResult={setResult}
              error={error}
              setError={setError}
            />
          ) : (
            <Result
              data={result}
              onReset={() => { setResult(null); setError('') }}
            />
          )}
        </main>

      </div>
    </div>
  )
}
