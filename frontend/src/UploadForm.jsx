import React, { useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { buildGeminiGenerateUrl, finalizeAnalysisResult, parseGeminiResponseText, resolveAnalysisMode, resolveGeminiModel, retryTransientRequest, validateAnalysisResponse } from './analysis'
import uploadVisual from './assets/resume-card.svg'

// Point PDF.js worker to CDN (matches installed version automatically)
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

// ── Config from .env ───────────────────────────────────────────────────────
const GEMINI_KEY   = import.meta.env.VITE_GEMINI_API_KEY || ''
const GEMINI_MODEL = resolveGeminiModel(import.meta.env.VITE_GEMINI_MODEL || import.meta.env.VITE_GEMINI_MODEL_NAME || '')
const N8N_WEBHOOK  = import.meta.env.VITE_N8N_WEBHOOK_URL || ''
const MODE         = resolveAnalysisMode({ geminiKey: GEMINI_KEY, n8nWebhook: N8N_WEBHOOK })

// ── Extract text from PDF using PDF.js ────────────────────────────────────
async function extractPDF(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text    = content.items.map(item => item.str).join(' ')
    pages.push(text)
  }
  return pages.join('\n\n').trim()
}

// ── Extract readable text from any supported file ─────────────────────────
async function extractText(file) {
  // Plain text — read directly
  if (file.type === 'text/plain') {
    return new Promise(resolve => {
      const r = new FileReader()
      r.onload = e => resolve(e.target.result)
      r.readAsText(file)
    })
  }

  // PDF — use PDF.js for clean text
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    try {
      const text = await extractPDF(file)
      if (text.length > 80) return text
    } catch { /* fall through to byte scan */ }
  }

  // DOCX / fallback — byte scan for printable ASCII
  return new Promise(resolve => {
    const r = new FileReader()
    r.onload = e => {
      const bytes = new Uint8Array(e.target.result)
      let text = ''
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i]
        if (b >= 32 && b < 127) text += String.fromCharCode(b)
        else if (b === 10 || b === 13) text += '\n'
      }
      text = text
        .replace(/[^\x20-\x7E\n\r\t]{2,}/g, ' ')
        .replace(/[ \t]{4,}/g, ' ')
        .replace(/\n{4,}/g, '\n\n')
        .trim()
      resolve(text.length > 80 ? text : `[Could not extract text from ${file.name}]`)
    }
    r.readAsArrayBuffer(file)
  })
}

// ── Call Gemini API directly ───────────────────────────────────────────────
async function callGemini(resumeText, jobDescription) {
  const safeText = resumeText.slice(0, 6000)

  const prompt = `You are an evidence-based resume screening assistant. Return ONLY one valid JSON object, with no markdown or extra text.

JOB DESCRIPTION:
${jobDescription}

RESUME TEXT:
${safeText}

Extract the candidate's name and experience only from the resume. Never use the uploaded filename as a name. If the name is absent, use "Name not identified in resume". Report professional experience only when supported by the resume; do not count education or projects as employment years. If years are not stated, use null for experienceYears and "Not stated in resume" for experience. Use null for requiredExperienceYears unless the job description explicitly states a minimum.

Extract concise skills and specific qualifications required by the job description. matchedSkills must contain only requirements with direct evidence in the resume. missingSkills must contain the remaining required items that are not evidenced in the resume; absence from the resume does not prove the candidate lacks a skill. Use the same canonical labels in requiredSkills, matchedSkills, and missingSkills. Write a realistic 2-4 sentence summary grounded in both texts, distinguishing documented evidence from gaps. Do not invent a score or hiring recommendation; the application calculates those.

Return exactly this JSON shape:
{"candidateName":"Name not identified in resume","experience":"Not stated in resume","experienceYears":null,"relevantExperience":false,"requiredExperienceYears":null,"requiredSkills":["Python"],"matchedSkills":["Python"],"missingSkills":[],"summary":"Evidence-based 2-4 sentence assessment."}`

  const url = `${buildGeminiGenerateUrl(GEMINI_MODEL)}?key=${encodeURIComponent(GEMINI_KEY)}`

  const res = await retryTransientRequest(async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              candidateName: { type: 'STRING' },
              experience: { type: 'STRING' },
              experienceYears: { type: 'NUMBER', nullable: true },
              relevantExperience: { type: 'BOOLEAN' },
              requiredExperienceYears: { type: 'NUMBER', nullable: true },
              requiredSkills: { type: 'ARRAY', items: { type: 'STRING' } },
              matchedSkills: { type: 'ARRAY', items: { type: 'STRING' } },
              missingSkills: { type: 'ARRAY', items: { type: 'STRING' } },
              summary: { type: 'STRING' },
            },
            required: [
              'candidateName', 'experience', 'experienceYears', 'relevantExperience',
              'requiredExperienceYears', 'requiredSkills', 'matchedSkills', 'missingSkills', 'summary',
            ],
          },
        },
      }),
    })

    if (!response.ok) {
      const details = await response.json().catch(() => ({}))
      const error = new Error(details?.error?.message || `Gemini API error ${response.status}`)
      error.status = response.status
      throw error
    }
    return response
  })

  const data = await res.json()
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

  return parseGeminiResponseText(raw)
}


// ── POST to n8n Webhook (fallback if no Gemini key) ───────────────────────
async function callN8n(resumeText, jobDescription) {
  const res = await fetch(N8N_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText, jobDescription }),
  })
  if (!res.ok) throw new Error(`n8n returned HTTP ${res.status}`)
  const text = await res.text()
  if (!text || text.trim() === '') {
    throw new Error('The n8n webhook returned no analysis. Configure Respond to Webhook to return the parsed ATS result.')
  }
  try {
    const data = JSON.parse(text)
    const candidates = [data?.body, Array.isArray(data) ? data[0] : null, data]
    const result = candidates.find(candidate => candidate && typeof candidate === 'object'
      && ['candidateName', 'requiredSkills', 'matchedSkills'].some(field => field in candidate)) || data
    return validateAnalysisResponse(result)
  } catch {
    throw new Error('The n8n webhook did not return valid ATS analysis JSON. Update and activate the current workflow.')
  }
}

// ── Route to correct backend ───────────────────────────────────────────────
async function analyzeResume(resumeText, jobDescription) {
  if (MODE === 'unconfigured') {
    throw new Error('AI analysis is not configured. Add a Gemini API key or n8n webhook URL in frontend/.env.local, then restart the app. No demo report will be generated.')
  }

  const response = MODE === 'gemini'
    ? await callGemini(resumeText, jobDescription)
    : await callN8n(resumeText, jobDescription)

  return finalizeAnalysisResult(validateAnalysisResponse(response))
}



// ── Processing steps shown during loading ─────────────────────────────────

const STEPS = [
  { icon: '📤', label: 'Reading resume content…' },
  { icon: '📄', label: 'Extracting resume evidence…' },
  { icon: '🤖', label: 'Comparing skills with role requirements…' },
  { icon: '📊', label: 'Calculating score and recommendation…' },
]

// ─────────────────────────────────────────────────────────────────────────────
export default function UploadForm({ loading, setLoading, setResult, error, setError }) {
  const fileRef             = useRef(null)
  const [file,   setFile]   = useState(null)
  const [jobDesc, setJobDesc] = useState('')
  const [drag,   setDrag]   = useState(false)
  const [step,   setStep]   = useState(-1)

  // ── File validation ──────────────────────────────────────────────────────
  function handleFile(f) {
    if (!f) return
    const ok =
      ['application/pdf', 'application/msword',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'text/plain'].includes(f.type) || /\.(pdf|doc|docx|txt)$/i.test(f.name)
    if (!ok) return setError('Please upload a PDF, DOCX, or TXT file.')
    if (f.size > 10 * 1024 * 1024) return setError('File must be under 10 MB.')
    setFile(f)
    setError('')
  }

  // ── Animate processing steps ─────────────────────────────────────────────
  function animateSteps() {
    return new Promise(resolve => {
      let i = 0
      setStep(0)
      const tick = setInterval(() => {
        i++
        if (i < STEPS.length) setStep(i)
        else { clearInterval(tick); resolve() }
      }, 950)
    })
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    if (MODE === 'unconfigured') {
      return setError('AI analysis is not configured. Add a Gemini API key or n8n webhook URL in frontend/.env.local, then restart the app.')
    }
    if (!file)           return setError('Please choose a resume file.')
    if (!jobDesc.trim()) return setError('Please paste the job description.')

    setLoading(true)
    setError('')

    try {
      // Extract text client-side first, then send JSON to n8n webhook
      const resumeText = await extractText(file)
      const [data] = await Promise.all([
        analyzeResume(resumeText, jobDesc.trim()),
        animateSteps(),
      ])
      setStep(-1)
      setResult(data)
    } catch (err) {
      setStep(-1)
      setError(`Analysis failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="upload-view animate-fade-in">
      {MODE === 'unconfigured' && (
        <div className="analysis-config-warning" role="status">
          <strong>AI analysis is not configured.</strong>
          <span>Add <code>VITE_GEMINI_API_KEY</code> or <code>VITE_N8N_WEBHOOK_URL</code> to <code>frontend/.env.local</code>, then restart the app. No sample or keyword-only report will be presented as resume analysis.</span>
        </div>
      )}

      {/* ── Hero Section ──────────────────────────────────────────────────── */}
      <div className="upload-hero" style={{ textAlign: 'center', marginBottom: 52 }}>
        <div className="hero-kicker"><span /> CANDIDATE INTELLIGENCE <b>/</b> ROLE MATCHING</div>
        <h1 className="display-title" style={{
          fontFamily: "'Sora', sans-serif",
          fontSize: 'clamp(36px, 6vw, 60px)',
          fontWeight: 800, lineHeight: 1.1,
          letterSpacing: '-0.03em',
          marginBottom: 20,
        }}>
          <span>Screen smarter</span>
          <br />
          <span style={{ color: 'rgba(226,232,240,0.85)', fontSize: '0.7em', fontWeight: 600 }}>
            find better matches
          </span>
        </h1>

        <p style={{
          color: 'rgba(148,163,184,0.8)',
          fontSize: 17, lineHeight: 1.65,
          width: '100%', maxWidth: 'none', margin: 0,
        }}>
          Upload a resume and job description to quickly uncover the candidate's
          strongest qualifications, missing requirements, and overall role fit.
        </p>
      </div>

      {/* ── Feature Stats Row ────────────────────────────────────────────── */}
      <div className="mini-stats" style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16, marginBottom: 44,
      }}>
        {[
          { icon: '🎯', iconColor: '#1769e0', value: 'Role fit', label: 'Match strength' },
          { icon: '⚠', iconColor: '#d97706', value: 'Skill gaps', label: 'What to improve' },
          { icon: '✓', iconColor: '#078a70', value: 'Clear next step', label: 'Hiring decision' },
        ].map(({ icon, iconColor, value, label }) => (
          <div key={label} className="mini-stat glass" style={{
            borderRadius: 16, padding: '20px 16px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 22, marginBottom: 8, color: iconColor, fontWeight: 800 }}>{icon}</div>
            <div style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 20, fontWeight: 700,
              background: 'linear-gradient(135deg, #c4b5fd, #f9a8d4)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text', marginBottom: 4,
            }}>{value}</div>
            <div style={{ color: 'rgba(148,163,184,0.6)', fontSize: 12 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <div className="form-layout">
      <div className="form-panel">
      <form className="screening-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Dropzone */}
        <div>
          <label className="upload-heading" style={{
            display: 'block', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'rgba(148,163,184,0.7)', marginBottom: 10,
          }}>
            <img className="upload-heading-image" src={uploadVisual} alt="" />
            Upload Resume
          </label>

          <div
            id="resume-dropzone"
            className={`dropzone resume-dropzone${drag ? ' drag-over' : ''}`}
            style={{ borderRadius: 20, padding: '44px 32px', textAlign: 'center' }}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]) }}
          >
            <input
              ref={fileRef} type="file" hidden
              id="resume-file-input"
              accept=".pdf,.doc,.docx,.txt"
              onChange={e => handleFile(e.target.files[0])}
            />

            {file ? (
                <div className="file-ready" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                <div className="file-icon" style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: 'rgba(99,49,255,0.2)',
                  border: '1px solid rgba(99,49,255,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, flexShrink: 0,
                }}>📄</div>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontWeight: 700, color: '#c4b5fd', fontSize: 15 }}>{file.name}</p>
                  <p style={{ color: 'rgba(148,163,184,0.5)', fontSize: 12, marginTop: 2 }}>
                    {(file.size / 1024).toFixed(1)} KB · Click to change
                  </p>
                </div>
                <button
                  type="button"
                  id="remove-file-btn"
                  onClick={e => { e.stopPropagation(); setFile(null) }}
                  style={{
                    marginLeft: 8, width: 28, height: 28, borderRadius: '50%',
                    background: 'rgba(239,68,68,0.15)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: '#f87171', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, transition: 'all 0.2s',
                  }}
                >✕</button>
              </div>
            ) : (
              <>
                <div className="upload-icon animate-float" style={{
                  width: 64, height: 64, borderRadius: 18, margin: '0 auto 16px',
                  background: 'rgba(99,49,255,0.12)',
                  border: '1px solid rgba(99,49,255,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28,
                }}>↑</div>
                <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: '#e2e8f0' }}>
                  Drag &amp; Drop your resume here
                </p>
                <p style={{ color: 'rgba(148,163,184,0.5)', fontSize: 13 }}>
                  or <span style={{ color: '#a78bfa', textDecoration: 'underline' }}>browse files</span>
                </p>
                <p style={{ color: 'rgba(148,163,184,0.3)', fontSize: 11, marginTop: 10 }}>
                  PDF · DOCX · TXT &nbsp;·&nbsp; Max 10 MB
                </p>
              </>
            )}
          </div>
        </div>

        {/* Job Description */}
        <div>
          <label
            htmlFor="job-description"
            style={{
              display: 'block', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'rgba(148,163,184,0.7)', marginBottom: 10,
            }}
          >
            📋 Job Description
          </label>
          <textarea
            className="job-textarea"
            id="job-description"
            rows={8}
            value={jobDesc}
            onChange={e => setJobDesc(e.target.value)}
            placeholder="Enter your description...."
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 16, padding: '16px 18px',
              color: '#e2e8f0', fontSize: 14, lineHeight: 1.7,
              resize: 'vertical', transition: 'all 0.3s',
              fontFamily: "'Manrope', sans-serif",
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="animate-fade-in" style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 12, padding: '12px 16px',
            color: '#f87171', fontSize: 13,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <span style={{ fontSize: 15, flexShrink: 0 }}>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Processing Steps */}
        {loading && (
          <div className="loading-panel glass animate-fade-in" style={{ borderRadius: 20, padding: '28px 28px 24px' }}>
            <p style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'rgba(167,139,250,0.6)',
              marginBottom: 20,
            }}>Processing via n8n workflow</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {STEPS.map((s, i) => {
                const done    = i < step
                const active  = i === step
                const pending = i > step
                return (
                  <div key={i} className={`loading-step ${done ? 'done' : active ? 'active' : 'pending'}`} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    opacity: pending ? 0.3 : 1, transition: 'all 0.4s',
                  }}>
                    {/* Circle icon */}
                    <div className="loading-dot" style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: done ? 13 : 14,
                      background: done   ? 'rgba(16,185,129,0.15)'
                                : active ? 'rgba(99,49,255,0.20)'
                                : 'rgba(148,163,184,0.05)',
                      border: done   ? '1px solid rgba(16,185,129,0.4)'
                             : active ? '1px solid rgba(99,49,255,0.5)'
                             : '1px solid rgba(148,163,184,0.12)',
                      transition: 'all 0.4s',
                    }}>
                      {done ? (
                        <span style={{ color: '#34d399', fontWeight: 700, fontSize: 12 }}>✓</span>
                      ) : active ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                          style={{ animation: 'spin 1s linear infinite' }}>
                          <circle cx="12" cy="12" r="10" stroke="rgba(99,49,255,0.3)" strokeWidth="4"/>
                          <path d="M4 12a8 8 0 018-8" stroke="#a78bfa" strokeWidth="4" strokeLinecap="round"/>
                        </svg>
                      ) : (
                        <span style={{ fontSize: 12 }}>{s.icon}</span>
                      )}
                    </div>

                    <span style={{
                      fontSize: 14, fontWeight: done ? 500 : active ? 600 : 400,
                      color: done ? '#34d399' : active ? '#c4b5fd' : 'rgba(148,163,184,0.5)',
                    }}>{s.label}</span>
                  </div>
                )
              })}
            </div>

            {/* Progress bar */}
            <div style={{
              marginTop: 24, height: 3, borderRadius: 99,
              background: 'rgba(148,163,184,0.1)', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${step < 0 ? 0 : ((step + 1) / STEPS.length) * 100}%`,
                borderRadius: 99, transition: 'width 0.8s ease',
                background: 'linear-gradient(90deg, #6331ff, #a855f7, #ec4899)',
                boxShadow: '0 0 10px rgba(99,49,255,0.6)',
              }} />
            </div>
            <p style={{ color: 'rgba(148,163,184,0.3)', fontSize: 11, marginTop: 10, textAlign: 'right' }}>
              This may take 10–20 seconds
            </p>
          </div>
        )}

        {/* Submit Button */}
        {!loading && (
          <button
            type="submit"
            id="analyze-btn"
            className="analyze-button btn-shimmer"
            style={{
              width: '100%', padding: '18px', borderRadius: 16,
              fontWeight: 800, fontSize: 16, color: '#fff',
              border: 'none', cursor: 'pointer', letterSpacing: '0.01em',
              fontFamily: "'Sora', sans-serif",
            }}
          >
            <span aria-hidden="true">🔍</span> Analyze Resume
          </button>
        )}
      </form>
      </div>
      </div>
    </div>
  )
}
