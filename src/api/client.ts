import type {
  AnalysisResult,
  SecurityRuleMetadata,
} from '../analyzer/types'

interface ApiError {
  error?: string
}

export interface HealthResponse {
  status: 'ok'
  service: string
  version: string
  timestamp: string
}

const parseResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiError
    throw new Error(body.error ?? `Request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

export const analyzeWorkload = async (
  source: string,
): Promise<AnalysisResult> => {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  })

  return parseResponse<AnalysisResult>(response)
}

export const getRules = async (): Promise<SecurityRuleMetadata[]> => {
  const response = await fetch('/api/rules')
  return parseResponse<SecurityRuleMetadata[]>(response)
}

export const getHealth = async (): Promise<HealthResponse> => {
  const response = await fetch('/api/health')
  return parseResponse<HealthResponse>(response)
}
