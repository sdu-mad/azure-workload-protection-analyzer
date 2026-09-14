import { describe, expect, it } from 'vitest'
import insecureSample from '../samples/insecure-workload.bicep?raw'
import secureSample from '../samples/secure-workload.bicep?raw'
import { analyzeBicep } from './analyze'
import { securityRules } from './rules'

const evaluateRule = (id: string, source: string) => {
  const rule = securityRules.find((candidate) => candidate.id === id)
  if (!rule) throw new Error(`Unknown rule ${id}`)
  return rule.evaluate(source)
}

describe('security rules', () => {
  it.each([
    ['CWP001', "identity: { type: 'SystemAssigned' }", 'pass'],
    ['CWP001', "identity: { type: 'None' }", 'critical'],
    ['CWP002', 'adminUserEnabled: false', 'pass'],
    ['CWP002', 'adminUserEnabled: true', 'critical'],
    [
      'CWP003',
      "resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {}",
      'pass',
    ],
    [
      'CWP003',
      "resource app 'Microsoft.App/containerApps@2024-03-01' = {}",
      'critical',
    ],
    ['CWP004', "value: 'not-sensitive'", 'pass'],
    ['CWP004', "apiKey: 'hardcoded-value'", 'critical'],
    ['CWP005', 'external: false', 'pass'],
    ['CWP005', 'external: true', 'warning'],
    [
      'CWP006',
      "resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {}",
      'pass',
    ],
    [
      'CWP006',
      "resource app 'Microsoft.App/containerApps@2024-03-01' = {}",
      'critical',
    ],
  ])('%s evaluates source as %s', (id, source, expected) => {
    expect(evaluateRule(id, source)).toBe(expected)
  })

  it('ignores findings that appear only in comments', () => {
    expect(evaluateRule('CWP005', '// external: true')).toBe('pass')
    expect(evaluateRule('CWP004', "/* password: 'value' */")).toBe('pass')
  })
})

describe('analyzeBicep', () => {
  it('scores the secure sample at 100', () => {
    const result = analyzeBicep(secureSample)
    expect(result.score).toBe(100)
    expect(result.status).toBe('Ready for Protection')
  })

  it('scores the insecure sample at 37', () => {
    const result = analyzeBicep(insecureSample)
    expect(result.score).toBe(37)
    expect(result.status).toBe('Poor')
  })
})
