import { countArmResources, securityRules } from './rules'
import type {
  AnalysisResult,
  ArmTemplate,
  CategoryScore,
  CompilerDiagnostic,
  RuleStatus,
  SecurityCategory,
} from './types'

const categoryOrder: SecurityCategory[] = [
  'Identity',
  'Secrets',
  'Registry',
  'Network',
  'Monitoring',
  'Reliability',
]

const earnedWeight = (status: RuleStatus, weight: number) => {
  if (status === 'pass') return weight
  if (status === 'warning') return weight * 0.5
  return weight * 0.2
}
const overallStatus = (score: number): AnalysisResult['status'] => {
  if (score >= 85) return 'Ready for Protection'
  if (score >= 70) return 'Good'
  if (score >= 50) return 'Needs Improvement'
  return 'Poor'
}

export const analyzeArmTemplate = (
  template: ArmTemplate,
  compilation: {
    entrypoint: string
    fileCount: number
    diagnostics?: CompilerDiagnostic[]
  },
): AnalysisResult => {
  const findings = securityRules.map((rule) => {
    const evaluation = rule.evaluate({ template })
    return {
      id: rule.id,
      title: rule.title,
      severity: evaluation.status,
      evidence: evaluation.evidence,
      description: rule.description,
      recommendation: rule.recommendation,
      weight: rule.weight,
      category: rule.category,
    }
  })

  const score = Math.round(
    findings.reduce(
      (total, finding) =>
        total + earnedWeight(finding.severity, finding.weight),
      0,
    ),
  )

  const categories: CategoryScore[] = categoryOrder.map((category) => {
    const categoryFindings = findings.filter(
      (finding) => finding.category === category,
    )
    const possible = categoryFindings.reduce(
      (total, finding) => total + finding.weight,
      0,
    )
    const earned = categoryFindings.reduce(
      (total, finding) =>
        total + earnedWeight(finding.severity, finding.weight),
      0,
    )
    const hasCritical = categoryFindings.some(
      (finding) => finding.severity === 'critical',
    )
    const hasWarning = categoryFindings.some(
      (finding) => finding.severity === 'warning',
    )

    return {
      category,
      score: possible === 0 ? 0 : Math.round((earned / possible) * 100),
      possible,
      status: hasCritical ? 'critical' : hasWarning ? 'warning' : 'pass',
    }
  })

  return {
    score,
    status: overallStatus(score),
    findings,
    categories,
    compilation: {
      status: 'succeeded',
      entrypoint: compilation.entrypoint,
      fileCount: compilation.fileCount,
      resourceCount: countArmResources(template),
      diagnostics: compilation.diagnostics ?? [],
    },
  }
}
