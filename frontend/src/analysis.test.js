import test from 'node:test'
import assert from 'node:assert/strict'

import {
  finalizeAnalysisResult,
  isRecommendation,
  parseGeminiResponseText,
  resolveAnalysisMode,
  resolveGeminiModel,
  buildGeminiGenerateUrl,
  retryTransientRequest,
  validateAnalysisResponse,
} from './analysis.js'

test('analysis is marked unconfigured when no backend is available', () => {
  assert.equal(resolveAnalysisMode({ geminiKey: '', n8nWebhook: '' }), 'unconfigured')
  assert.equal(resolveAnalysisMode({
    geminiKey: 'YOUR_GEMINI_API_KEY_HERE',
    n8nWebhook: 'https://your-n8n-host/webhook/your-workflow-id',
  }), 'unconfigured')
})

test('Gemini mode wins when a valid key exists', () => {
  assert.equal(
    resolveAnalysisMode({ geminiKey: 'abcd1234567890abcdef', n8nWebhook: '' }),
    'gemini'
  )
})

test('incomplete AI responses are rejected instead of shown as analysis', () => {
  assert.throws(
    () => validateAnalysisResponse({ candidateName: 'Jane Doe' }),
    /AI response is incomplete/
  )
})

test('Gemini response parser extracts a complete object with nested braces and surrounding text', () => {
  const response = parseGeminiResponseText('Analysis:\n```json\n{"candidateName":"Alex {Example}","summary":"Uses } in a template."}\n```\nDone.')
  assert.deepEqual(response, {
    candidateName: 'Alex {Example}',
    summary: 'Uses } in a template.',
  })
})

test('Gemini response parser rejects malformed or truncated JSON clearly', () => {
  assert.throws(
    () => parseGeminiResponseText('{"candidateName":"unfinished"'),
    /malformed or truncated JSON/
  )
})

test('transient provider errors retry with exponential backoff', async () => {
  const delays = []
  let calls = 0
  const result = await retryTransientRequest(async () => {
    calls++
    if (calls < 3) throw Object.assign(new Error('provider overloaded'), { status: 503 })
    return 'analysis result'
  }, { wait: async delay => delays.push(delay) })

  assert.equal(result, 'analysis result')
  assert.equal(calls, 3)
  assert.deepEqual(delays, [1000, 2000])
})

test('non-retryable provider errors fail immediately', async () => {
  let calls = 0
  await assert.rejects(
    retryTransientRequest(async () => {
      calls++
      throw Object.assign(new Error('invalid API key'), { status: 401 })
    }, { wait: async () => {} }),
    /invalid API key/
  )
  assert.equal(calls, 1)
})

test('score and recommendation are calculated from skill and experience fit', () => {
  const result = finalizeAnalysisResult({
    candidateName: 'Sam Lee',
    experience: '1 year of relevant experience',
    experienceYears: 1,
    requiredExperienceYears: 2,
    requiredSkills: ['Python', 'Machine Learning'],
    matchedSkills: ['Python'],
    missingSkills: ['Machine Learning'],
    summary: 'The resume documents Python experience and a gap in machine learning evidence.',
  })

  assert.equal(result.overallScore, 50)
  assert.equal(result.recommendation, 'Develop skills before applying')
  assert.equal(result.skillCoveragePercent, 50)
  assert.equal(result.experienceFitPercent, 50)
  assert.ok(isRecommendation(result.recommendation))
})

test('strong skill fit with an unmet experience requirement recommends internship', () => {
  const result = finalizeAnalysisResult({
    experience: '1 year',
    experienceYears: 1,
    requiredExperienceYears: 3,
    requiredSkills: ['Python'],
    matchedSkills: ['Python'],
    summary: 'The resume documents Python but does not state three years of experience.',
  })

  assert.equal(result.overallScore, 87)
  assert.equal(result.recommendation, 'Recommend internship')
})

test('Gemini model defaults to 3.6 Flash and preserves other explicit model choices', () => {
  assert.equal(resolveGeminiModel(''), 'gemini-3.6-flash')
  assert.equal(resolveGeminiModel('models/gemini-3.6-flash'), 'gemini-3.6-flash')
  assert.equal(resolveGeminiModel('gemini-2.5-flash'), 'gemini-3.6-flash')
  assert.equal(resolveGeminiModel('gemini-3.8-flash'), 'gemini-3.6-flash')
  assert.equal(resolveGeminiModel('gemini-3.6-pro'), 'gemini-3.6-pro')
  assert.equal(buildGeminiGenerateUrl(), 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent')
})
