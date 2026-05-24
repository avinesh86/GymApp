import React, { useState } from 'react'
import { TrendingUp, AlertTriangle, Lightbulb, Sparkles } from 'lucide-react'
import {
  getInstructorReliabilityReport,
  getClassViabilityReport,
  getPayrollReport,
} from '../../../api/reports'
import { Card } from '../../../components/ui/Card'
import { Spinner } from '../../../components/ui/Spinner'

// ─── Types ────────────────────────────────────────────────────────────────────

interface InsightItem {
  title: string
  detail: string
}

interface RecommendationItem {
  title: string
  action: string
}

interface AIInsights {
  summary: string
  positive_trends: InsightItem[]
  areas_of_concern: InsightItem[]
  recommendations: RecommendationItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPrompt(instructors: unknown, viability: unknown, payroll: unknown): string {
  const data = JSON.stringify({ instructors, viability, payroll }, null, 2)
  return (
    `Analyze this gym data and provide: ` +
    `1) Top performing instructors, ` +
    `2) Underperforming classes needing attention, ` +
    `3) Schedule optimization suggestions, ` +
    `4) Training/development recommendations. ` +
    `Format your entire response as a single JSON object with these exact keys: ` +
    `"summary" (string), ` +
    `"positive_trends" (array of objects with "title" and "detail" strings), ` +
    `"areas_of_concern" (array of objects with "title" and "detail" strings), ` +
    `"recommendations" (array of objects with "title" and "action" strings). ` +
    `Do not include any text outside the JSON.\n\nData:\n${data}`
  )
}

function extractJsonFromText(text: string): AIInsights {
  // The model is instructed to return only JSON, but guard against any preamble
  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('No JSON object found in API response')
  }
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as AIInsights
}

async function fetchInsights(): Promise<AIInsights> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined
  if (!apiKey) {
    throw new MissingApiKeyError()
  }

  const [instructors, viability, payroll] = await Promise.all([
    getInstructorReliabilityReport(),
    getClassViabilityReport(),
    getPayrollReport(),
  ])

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: buildPrompt(instructors, viability, payroll) },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`)
  }

  const body = await response.json() as { content: Array<{ type: string; text: string }> }
  const textBlock = body.content.find((block) => block.type === 'text')
  if (!textBlock) {
    throw new Error('No text content in API response')
  }

  return extractJsonFromText(textBlock.text)
}

// ─── Custom error for missing key so we can render a distinct state ───────────

class MissingApiKeyError extends Error {
  constructor() {
    super('VITE_ANTHROPIC_API_KEY is not set')
    this.name = 'MissingApiKeyError'
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InsightCard({ title, detail }: { title: string; detail: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="text-sm text-gray-600 leading-relaxed">{detail}</p>
    </Card>
  )
}

function RecommendationCard({ title, action }: { title: string; action: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="text-sm text-gray-600 leading-relaxed">{action}</p>
    </Card>
  )
}

function SectionHeading({
  icon,
  label,
  iconClassName,
}: {
  icon: React.ReactNode
  label: string
  iconClassName: string
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={iconClassName}>{icon}</span>
      <h3 className="text-sm font-semibold text-gray-800">{label}</h3>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AIInsightsTab() {
  const [insights, setInsights] = useState<AIInsights | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMissingKey, setIsMissingKey] = useState(false)

  async function handleGenerate() {
    setIsLoading(true)
    setError(null)
    setIsMissingKey(false)
    setInsights(null)

    try {
      const result = await fetchInsights()
      setInsights(result)
    } catch (err) {
      if (err instanceof MissingApiKeyError) {
        setIsMissingKey(true)
      } else {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header + generate button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">AI-Powered Insights</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Analyzes instructor reliability, class viability, and payroll data to surface actionable insights.
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className={[
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            isLoading
              ? 'bg-cyan-300 text-white cursor-not-allowed'
              : 'bg-cyan-500 hover:bg-cyan-600 text-white',
          ].join(' ')}
        >
          {isLoading ? (
            <>
              <Spinner size="sm" className="text-white" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate Insights
            </>
          )}
        </button>
      </div>

      {/* Missing API key notice */}
      {isMissingKey && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Set <code className="font-mono font-semibold">VITE_ANTHROPIC_API_KEY</code> in your{' '}
          <code className="font-mono font-semibold">.env</code> file to enable AI insights.
        </div>
      )}

      {/* API error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Empty prompt state */}
      {!isLoading && !insights && !isMissingKey && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400 gap-3">
          <Sparkles className="h-10 w-10 text-gray-200" />
          <p className="text-sm">Click "Generate Insights" to analyse your gym data with Claude AI.</p>
        </div>
      )}

      {/* Results */}
      {insights && (
        <div className="flex flex-col gap-6">
          {/* Summary */}
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-4">
            <p className="text-sm text-gray-700 leading-relaxed">{insights.summary}</p>
          </div>

          {/* Positive trends */}
          {insights.positive_trends.length > 0 && (
            <section>
              <SectionHeading
                icon={<TrendingUp className="h-4 w-4" />}
                label="Positive Trends"
                iconClassName="text-green-500"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {insights.positive_trends.map((item, index) => (
                  <InsightCard key={index} title={item.title} detail={item.detail} />
                ))}
              </div>
            </section>
          )}

          {/* Areas of concern */}
          {insights.areas_of_concern.length > 0 && (
            <section>
              <SectionHeading
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Areas of Concern"
                iconClassName="text-orange-500"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {insights.areas_of_concern.map((item, index) => (
                  <InsightCard key={index} title={item.title} detail={item.detail} />
                ))}
              </div>
            </section>
          )}

          {/* Recommendations */}
          {insights.recommendations.length > 0 && (
            <section>
              <SectionHeading
                icon={<Lightbulb className="h-4 w-4" />}
                label="Recommendations"
                iconClassName="text-cyan-500"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {insights.recommendations.map((item, index) => (
                  <RecommendationCard key={index} title={item.title} action={item.action} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
