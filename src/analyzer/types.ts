export type RuleStatus = 'pass' | 'warning' | 'critical'

export type SecurityCategory =
  | 'Identity'
  | 'Secrets'
  | 'Registry'
  | 'Network'
  | 'Monitoring'

export interface SecurityRule {
  id: string
  title: string
  description: string
  recommendation: string
  weight: number
  category: SecurityCategory
  evaluate: (source: string) => RuleStatus
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
}

export interface CategoryScore {
  category: SecurityCategory
  score: number
  possible: number
  status: RuleStatus
}

export interface AnalysisResult {
  score: number
  status: 'Poor' | 'Needs Improvement' | 'Good' | 'Ready for Protection'
  findings: Finding[]
  categories: CategoryScore[]
}
