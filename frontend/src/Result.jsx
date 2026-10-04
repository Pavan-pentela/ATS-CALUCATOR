import React, { useEffect, useState } from 'react'

// ── Colour helpers ─────────────────────────────────────────────────────────
function scoreColor(s) {
  if (s >= 80) return { grad: '#315be8, #72a3ff', text: '#315be8', glow: 'rgba(49,91,232,0.2)', label: 'Strong match' }
  if (s >= 55) return { grad: '#b77a16, #edbd54', text: '#9c6810', glow: 'rgba(183,122,22,0.2)', label: 'Potential fit' }
  return               { grad: '#d95d49, #f09278', text: '#c44d3b', glow: 'rgba(217,93,73,0.2)', label: 'Low match' }
}

const REC_STYLE = {
  'Shortlist for job': { bg: '#eaf0ff', border: '#cbd6ff', text: '#315be8', icon: '✓', desc: 'Strong role fit' },
  'Recommend internship': { bg: '#fff5df', border: '#eed9a6', text: '#9b6710', icon: '↗', desc: 'Build role experience' },
  'Develop skills before applying': { bg: '#fff0ec', border: '#ecc4ba', text: '#c44d3b', icon: '!', desc: 'Address the listed gaps' },
}

// ── Animated Counter ──────────────────────────────────────────────────────
function Counter({ target, duration = 1400 }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let start = 0
    const step = 16
    const inc  = target / (duration / step)
    const t = setInterval(() => {
      start += inc
      if (start >= target) { setVal(target); clearInterval(t) }
      else setVal(Math.round(start))
    }, step)
    return () => clearInterval(t)
  }, [target, duration])
  return <>{val}</>
}

// ── Score Ring ──────────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const r     = 52
  const circ  = 2 * Math.PI * r
  const color = scoreColor(score)
  const offset = circ - (score / 100) * circ

  return (
    <div style={{ position: 'relative', width: 160, height: 160, margin: '0 auto' }}>
      {/* Outer glow */}
      <div style={{
        position: 'absolute', inset: -8, borderRadius: '50%',
        background: `radial-gradient(circle, ${color.glow} 0%, transparent 70%)`,
        filter: 'blur(12px)',
      }} />

      <svg width="160" height="160" viewBox="0 0 120 120"
        style={{ transform: 'rotate(-90deg)', position: 'relative', zIndex: 1 }}>
        {/* Track */}
        <circle cx="60" cy="60" r={r} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        {/* Fill */}
        <circle cx="60" cy="60" r={r} fill="none"
          stroke={`url(#scoreGrad-${score})`}
          strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="score-ring-fill"
        />
        <defs>
          <linearGradient id={`scoreGrad-${score}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color.grad.split(', ')[0]} />
            <stop offset="100%" stopColor={color.grad.split(', ')[1]} />
          </linearGradient>
        </defs>
      </svg>

      {/* Centre text */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        zIndex: 2,
      }}>
        <span style={{
          fontSize: 34, fontWeight: 900, lineHeight: 1,
          fontFamily: "'Sora', sans-serif",
          color: color.text,
        }}>
          <Counter target={score} />
        </span>
        <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)', marginTop: 2 }}>/ 100</span>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: color.text, marginTop: 4, opacity: 0.8,
        }}>{color.label}</span>
      </div>
    </div>
  )
}

// ── Skill Chip ──────────────────────────────────────────────────────────
function SkillChip({ skill, type }) {
  const isGreen = type === 'match'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
      background: isGreen ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.10)',
      border: `1px solid ${isGreen ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.28)'}`,
      color: isGreen ? '#34d399' : '#f87171',
    }}>
      <span style={{ fontSize: 9 }}>{isGreen ? '✔' : '✘'}</span>
      {skill}
    </span>
  )
}

// ── Main Result Component ──────────────────────────────────────────────────
export default function Result({ data, onReset }) {

  // ── Form trigger: n8n accepted submission but returned no JSON ────────────
  if (data?.__submitted) {
    return (
      <div className="animate-fade-in-up" style={{ textAlign: 'center', padding: '60px 24px' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%', margin: '0 auto 28px',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.05))',
          border: '2px solid rgba(16,185,129,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36,
        }} className="animate-float">✅</div>

        <h2 style={{
          fontFamily: "'Sora', sans-serif",
          fontSize: 28, fontWeight: 800, marginBottom: 12,
          color: '#34d399',
        }}>Resume Submitted!</h2>

        <p style={{ color: 'rgba(226,232,240,0.7)', fontSize: 16, lineHeight: 1.7, maxWidth: 460, margin: '0 auto 12px' }}>
          Your resume was sent to the n8n workflow, but it did not return an analysis report. Check that the workflow responds with its parsed ATS result.
        </p>

        <div className="glass" style={{
          borderRadius: 16, padding: '20px 28px', maxWidth: 460, margin: '24px auto 0',
          textAlign: 'left',
        }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.7)', marginBottom: 14 }}>
            What happens next
          </p>
          {[
            ['📄', 'n8n extracts your resume PDF'],
            ['🤖', 'Gemini AI scores it vs the JD'],
            ['📊', 'Results are saved to Google Sheets'],
            ['📧', 'A decision email is sent automatically'],
          ].map(([icon, text]) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: 14, color: 'rgba(226,232,240,0.7)' }}>{text}</span>
            </div>
          ))}
        </div>

        <p style={{ color: 'rgba(148,163,184,0.4)', fontSize: 12, marginTop: 20 }}>
          💡 To see live scores here, add a <strong>Respond to Webhook</strong> node at the end of your n8n workflow.
        </p>

        <button
          onClick={onReset}
          className="btn-shimmer"
          style={{
            marginTop: 32, padding: '14px 36px', borderRadius: 14,
            fontWeight: 700, fontSize: 15, color: '#fff',
            border: 'none', cursor: 'pointer',
            fontFamily: "'Sora', sans-serif",
          }}
        >
          ← Submit Another Resume
        </button>
      </div>
    )
  }

  const {
    candidateName  = 'Name not identified in resume',
    overallScore   = 0,
    experience     = 'Not stated in resume',
    matchedSkills  = [],
    missingSkills  = [],
    recommendation = 'Develop skills before applying',
    summary        = '',
  } = data

  const color    = scoreColor(overallScore)
  const recStyle = REC_STYLE[recommendation] || REC_STYLE['Develop skills before applying']


  // ── Download Report ────────────────────────────────────────────────────
  function downloadReport() {
    const hr = '-'.repeat(64)
    const lines = [
      'ATS RESUME SCREENING REPORT',
      '',
      hr,
      `  Candidate     : ${candidateName}`,
      `  ATS Score     : ${overallScore}/100  (${color.label})`,
      `  Experience    : ${experience}`,
      `  Recommendation: ${recommendation} - ${recStyle.desc}`,
      '  Score rubric  : 80% job-skill coverage + 20% experience fit',
      hr,
      '',
      '  MATCHED SKILLS',
      ...(matchedSkills.length ? matchedSkills.map(s => `    +  ${s}`) : ['    None evidenced']),
      '',
      '  MISSING JOB REQUIREMENTS (NOT EVIDENCED IN RESUME)',
      ...(missingSkills.length ? missingSkills.map(s => `    -  ${s}`) : ['    None identified']),
      '',
      hr,
      '  AI SUMMARY',
      '',
      `  ${summary}`,
      '',
      hr,
      `  Generated: ${new Date().toLocaleString()}`,
      '  AI-assisted resume and job description comparison',
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ATS_Report_${candidateName.replace(/[^a-z0-9]+/gi, '_')}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="result-view animate-fade-in-up">

      {/* Back */}
      <button
        id="back-btn"
        onClick={onReset}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          color: 'rgba(148,163,184,0.6)', fontSize: 13,
          background: 'none', border: 'none', cursor: 'pointer',
          marginBottom: 32, transition: 'color 0.2s',
          fontFamily: "'Manrope', sans-serif",
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
        onMouseLeave={e => e.currentTarget.style.color = 'rgba(148,163,184,0.6)'}
      >
        ← Analyze Another Resume
      </button>

      <h2 style={{
        fontFamily: "'Sora', sans-serif",
        fontSize: 28, fontWeight: 800, marginBottom: 8,
        letterSpacing: '-0.02em',
      }}>ATS Resume Screening Report</h2>
      <p style={{ color: 'rgba(148,163,184,0.5)', fontSize: 13, marginBottom: 32 }}>
        Generated {new Date().toLocaleString()} · Powered by Google Gemini via n8n
      </p>

      {/* ── Hero Score Card ─────────────────────────────────────────────── */}
      <div className="glass" style={{
        borderRadius: 24, padding: '36px 32px', marginBottom: 20,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32,
        background: `linear-gradient(135deg, rgba(99,49,255,0.06) 0%, rgba(236,72,153,0.04) 100%)`,
      }}>
        <div style={{
          display: 'flex', flexWrap: 'wrap',
          alignItems: 'center', justifyContent: 'center', gap: 40,
          width: '100%',
        }}>
          {/* Ring */}
          <div>
            <ScoreRing score={overallScore} />
            <p style={{
              textAlign: 'center', marginTop: 12,
              color: 'rgba(148,163,184,0.5)', fontSize: 11,
              letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600,
            }}>ATS Score</p>
          </div>

          {/* Details */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ marginBottom: 20 }}>
              <p style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'rgba(148,163,184,0.4)',
                marginBottom: 6,
              }}>Candidate</p>
              <p style={{
                fontSize: 24, fontWeight: 800,
                fontFamily: "'Sora', sans-serif",
                letterSpacing: '-0.01em',
              }}>{candidateName}</p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <p style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'rgba(148,163,184,0.4)',
                marginBottom: 6,
              }}>Experience</p>
              <p style={{ fontSize: 17, fontWeight: 600, color: '#c4b5fd' }}>{experience}</p>
            </div>

            {/* Recommendation Badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '10px 20px', borderRadius: 12,
              background: recStyle.bg,
              border: `1px solid ${recStyle.border}`,
            }}>
              <span style={{ fontSize: 18 }}>{recStyle.icon}</span>
              <div>
                <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', marginBottom: 1 }}>Recommendation</p>
                <p style={{ fontSize: 15, fontWeight: 800, color: recStyle.text, lineHeight: 1 }}>
                  {recommendation}
                  <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 8, opacity: 0.7 }}>
                    · {recStyle.desc}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Score Progress Bar */}
        <div style={{ width: '100%' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            marginBottom: 8, fontSize: 12,
            color: 'rgba(148,163,184,0.5)',
          }}>
            <span>ATS Match</span>
            <span style={{ color: color.text, fontWeight: 700 }}>{overallScore}%</span>
          </div>
          <div style={{
            height: 6, borderRadius: 99,
            background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 99,
              width: `${overallScore}%`, transition: 'width 1.2s cubic-bezier(0.4,0,0.2,1)',
              background: `linear-gradient(90deg, ${color.grad})`,
              boxShadow: `0 0 12px ${color.glow}`,
            }} />
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            marginTop: 6, fontSize: 10, color: 'rgba(148,163,184,0.25)',
          }}>
            {['0','25','50','75','100'].map(n => <span key={n}>{n}</span>)}
          </div>
          <p className="score-rubric-note">
            Calculated from job-skill coverage ({data.skillCoveragePercent ?? 0}%) and experience fit ({data.experienceFitPercent ?? 0}%).
          </p>
        </div>
      </div>

      {/* ── Skills Grid ──────────────────────────────────────────────────── */}
      <div className="skills-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* Matched Skills */}
        <div className="glass" style={{ borderRadius: 20, padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(16,185,129,0.15)',
              border: '1px solid rgba(16,185,129,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14,
            }}>✔</div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#34d399' }}>
                Matched Skills
              </p>
              <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)' }}>{matchedSkills.length} found</p>
            </div>
          </div>

          {matchedSkills.length === 0 ? (
            <p style={{ color: 'rgba(148,163,184,0.4)', fontSize: 13 }}>No matches found.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {matchedSkills.map((s, i) => <SkillChip key={i} skill={s} type="match" />)}
            </div>
          )}
        </div>

        {/* Missing Skills */}
        <div className="glass" style={{ borderRadius: 20, padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.28)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, color: '#f87171',
            }}>✘</div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#f87171' }}>
                Missing Skills
              </p>
              <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)' }}>{missingSkills.length} gaps</p>
            </div>
          </div>

          {missingSkills.length === 0 ? (
            <p style={{ color: '#34d399', fontSize: 13 }}>No missing requirements were identified.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {missingSkills.map((s, i) => <SkillChip key={i} skill={s} type="miss" />)}
            </div>
          )}
          <p className="missing-skills-note">These job requirements were not evidenced in the resume; this does not confirm the candidate lacks them.</p>
        </div>
      </div>

      {/* ── Summary ──────────────────────────────────────────────────────── */}
      {summary && (
        <div style={{
          borderRadius: 20, padding: '24px 28px', marginBottom: 24,
          background: 'linear-gradient(135deg, rgba(99,49,255,0.08) 0%, rgba(168,85,247,0.06) 100%)',
          border: '1px solid rgba(99,49,255,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 18 }}>🤖</span>
            <p style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: '#a78bfa',
            }}>AI Summary</p>
          </div>
          <p style={{
            color: 'rgba(226,232,240,0.8)', fontSize: 14, lineHeight: 1.75,
          }}>{summary}</p>
        </div>
      )}

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="action-buttons" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <button
          id="analyze-another-btn"
          onClick={onReset}
          style={{
            flex: 1, minWidth: 160, padding: '16px',
            borderRadius: 14, fontWeight: 700, fontSize: 14,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#e2e8f0', cursor: 'pointer',
            transition: 'all 0.25s',
            fontFamily: "'Sora', sans-serif",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.09)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'
          }}
        >
          ← Analyze Another
        </button>

        <button
          id="download-report-btn"
          onClick={downloadReport}
          className="btn-shimmer"
          style={{
            flex: 1, minWidth: 160, padding: '16px',
            borderRadius: 14, fontWeight: 700, fontSize: 14,
            color: '#fff', border: 'none', cursor: 'pointer',
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          ⬇ Download Report
        </button>
      </div>
    </div>
  )
}
