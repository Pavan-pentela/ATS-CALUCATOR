const validRecommendations = [
  'Shortlist for job',
  'Recommend internship',
  'Develop skills before applying',
]

function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function retryTransientRequest(operation, { attempts = 3, wait } = {}) {
  const maxAttempts = Math.max(1, Math.floor(attempts))
  const pause = wait || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      const status = error?.status
      const retryable = status === undefined || [408, 429, 500, 502, 503, 504].includes(status)
      if (!retryable || attempt === maxAttempts) throw error
      await pause(1000 * (2 ** (attempt - 1)))
    }
  }

  throw new Error('Request failed after all retry attempts.')
}

export function parseGeminiResponseText(raw) {
  const cleaned = String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/```(?:json)?/gi, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {}

  for (let start = cleaned.indexOf('{'); start >= 0; start = cleaned.indexOf('{', start + 1)) {
    let depth = 0
    let inString = false
    let escaped = false

    for (let index = start; index < cleaned.length; index++) {
      const character = cleaned[index]
      if (inString) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') inString = false
        continue
      }
      if (character === '"') inString = true
      else if (character === '{') depth++
      else if (character === '}' && --depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, index + 1))
        } catch {
          break
        }
      }
    }
  }

  throw new Error('Gemini returned malformed or truncated JSON. Please retry the analysis.')
}

function asStringList(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean))]
    : []
}

function toYears(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  if (typeof value === 'string') {
    if (/\bfresher\b|\bno (?:professional )?experience\b/i.test(value)) return 0
    const match = value.match(/\b(\d+(?:\.\d+)?)\s*\+?\s*years?\b/i)
    if (match) return Number(match[1])
  }
  return null
}

function recommendationFor(score, experienceMeetsRequirement) {
  if (score >= 80 && experienceMeetsRequirement) return 'Shortlist for job'
  if (score >= 55) return 'Recommend internship'
  return 'Develop skills before applying'
}

export function validateAnalysisResponse(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('The AI provider did not return a valid analysis object.')
  }

  const requiredFields = [
    'candidateName', 'experience', 'experienceYears', 'relevantExperience',
    'requiredExperienceYears', 'requiredSkills', 'matchedSkills', 'missingSkills', 'summary',
  ]
  const missingFields = requiredFields.filter(field => !(field in result))
  if (missingFields.length) {
    throw new Error(`The AI response is incomplete (${missingFields.join(', ')}). Update the n8n workflow or check the Gemini response schema.`)
  }
  if (typeof result.candidateName !== 'string' || typeof result.experience !== 'string' || !result.experience.trim()) {
    throw new Error('The AI response is missing candidate name or experience details.')
  }
  if (typeof result.summary !== 'string' || !result.summary.trim()) {
    throw new Error('The AI response did not include a candidate summary.')
  }
  if (typeof result.relevantExperience !== 'boolean') {
    throw new Error('The AI response has an invalid relevant-experience value.')
  }
  for (const field of ['requiredSkills', 'matchedSkills', 'missingSkills']) {
    if (!Array.isArray(result[field]) || result[field].some(skill => typeof skill !== 'string')) {
      throw new Error(`The AI response has an invalid ${field} list.`)
    }
  }
  for (const field of ['experienceYears', 'requiredExperienceYears']) {
    const value = result[field]
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      throw new Error(`The AI response has an invalid ${field} value.`)
    }
  }

  return result
}

export function finalizeAnalysisResult(result = {}) {
  const rawMatched = asStringList(result.matchedSkills)
  const rawMissing = asStringList(result.missingSkills)
  const requiredSkills = asStringList(result.requiredSkills)
  const allRequirements = requiredSkills.length
    ? requiredSkills
    : [...new Set([...rawMatched, ...rawMissing])]
  const matchedSet = new Set(rawMatched.map(normalizeText))
  const matchedSkills = allRequirements.filter(skill => matchedSet.has(normalizeText(skill)))
  const missingSkills = allRequirements.filter(skill => !matchedSet.has(normalizeText(skill)))

  const candidateName = typeof result.candidateName === 'string' && result.candidateName.trim()
    && !/^(unknown|unknown candidate|not stated)$/i.test(result.candidateName.trim())
    ? result.candidateName.trim()
    : 'Name not identified in resume'
  const experienceYears = toYears(result.experienceYears ?? result.experience)
  const requiredExperienceYears = toYears(result.requiredExperienceYears)
  const experience = typeof result.experience === 'string' && result.experience.trim()
    && !/^(unknown|n\/a)$/i.test(result.experience.trim())
    ? result.experience.trim()
    : experienceYears === null ? 'Not stated in resume' : experienceYears === 0 ? 'Fresher' : `${experienceYears} years`
  const relevantExperience = typeof result.relevantExperience === 'boolean'
    ? result.relevantExperience
    : experienceYears !== null && experienceYears > 0

  const skillCoverage = allRequirements.length ? matchedSkills.length / allRequirements.length : 0
  const experienceFit = requiredExperienceYears !== null
    ? requiredExperienceYears === 0
      ? 1
      : experienceYears === null
        ? (relevantExperience ? 0.5 : 0)
        : Math.min(experienceYears / requiredExperienceYears, 1)
    : experienceYears > 0 || relevantExperience ? 1 : 0.5
  const experienceMeetsRequirement = requiredExperienceYears === null
    || (experienceYears !== null && experienceYears >= requiredExperienceYears)
  const overallScore = Math.round((skillCoverage * 80) + (experienceFit * 20))
  const recommendation = recommendationFor(overallScore, experienceMeetsRequirement)
  const summary = typeof result.summary === 'string' ? result.summary.trim() : ''

  return {
    candidateName,
    overallScore,
    experience,
    experienceYears,
    requiredExperienceYears,
    relevantExperience,
    requiredSkills: allRequirements,
    matchedSkills,
    missingSkills,
    skillCoveragePercent: Math.round(skillCoverage * 100),
    experienceFitPercent: Math.round(experienceFit * 100),
    recommendation,
    summary,
  }
}

export function resolveAnalysisMode({ geminiKey = '', n8nWebhook = '' } = {}) {
  const hasGemini = Boolean(geminiKey && geminiKey.trim().length > 10 && geminiKey !== 'YOUR_GEMINI_API_KEY_HERE')
  if (hasGemini) return 'gemini'

  const webhook = String(n8nWebhook ?? '').trim()
  const isPlaceholderWebhook = /^https?:\/\/your-n8n-host(?:\/|$)/i.test(webhook)
    || /YOUR_N8N_WEBHOOK_URL_HERE/i.test(webhook)
  const hasWebhook = Boolean(webhook && !isPlaceholderWebhook)
  if (hasWebhook) return 'n8n'

  return 'unconfigured'
}

export function resolveGeminiModel(modelName = '') {
  const trimmed = String(modelName ?? '').trim().replace(/^models\//i, '')
  if (!trimmed || trimmed === 'YOUR_GEMINI_MODEL_HERE' || /^gemini-(?:2\.5|3\.8)-flash$/i.test(trimmed)) {
    return 'gemini-3.6-flash'
  }
  return trimmed
}

export function buildGeminiGenerateUrl(modelName = '') {
  return `https://generativelanguage.googleapis.com/v1beta/models/${resolveGeminiModel(modelName)}:generateContent`
}

export function isRecommendation(value) {
  return validRecommendations.includes(value)
}
