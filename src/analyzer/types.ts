export type RuleStatus = 'pass' | 'warning' | 'critical'

export type SecurityCategory =
  | 'Identity'
  | 'Secrets'
  | 'Registry'
  | 'Network'
  | 'Monitoring'
  | 'Reliability'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

export interface ArmTemplate {
  [key: string]: JsonValue
}
export interface RuleEvaluation {
  status: RuleStatus
  evidence: string[]
}

export interface RuleContext {
  template: ArmTemplate
}

export interface SecurityRule {
  id: string
  title: string
  description: string
  recommendation: string
  weight: number
  category: SecurityCategory
  evaluate: (context: RuleContext) => RuleEvaluation
}

export type SecurityRuleMetadata = Omit<SecurityRule, 'evaluate'>

export interface Finding {
  id: string
  title: string
  severity: RuleStatus
  description: string
  recommendation: string
  weight: number
  category: SecurityCategory
  evidence: string[]
}

export interface CategoryScore {
  category: SecurityCategory
  score: number
  possible: number
  status: RuleStatus
}

export interface CompilerDiagnostic {
  file?: string
  line?: number
  column?: number
  level: 'error' | 'warning'
  code?: string
  message: string
}

export interface AnalysisResult {
  score: number
  status: 'Poor' | 'Needs Improvement' | 'Good' | 'Ready for Protection'
  findings: Finding[]
  categories: CategoryScore[]
  compilation: {
    status: 'succeeded'
    entrypoint: string
    fileCount: number
    resourceCount: number
    diagnostics: CompilerDiagnostic[]
  }
}

export interface BicepProject {
  entrypoint: string
  files: Record<string, string>
}
