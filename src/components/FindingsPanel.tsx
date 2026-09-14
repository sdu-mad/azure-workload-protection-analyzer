import type { Finding } from '../analyzer/types'

interface FindingsPanelProps {
  findings: Finding[]
}

const severityLabel = {
  critical: 'Critical',
  warning: 'Warning',
  pass: 'Pass',
}

export function FindingsPanel({ findings }: FindingsPanelProps) {
  return (
    <section className="section-block" aria-labelledby="findings-title">
      <div className="section-heading">
        <span className="section-number">03</span>
        <div>
          <h2 id="findings-title">Findings</h2>
          <p>Rule-level results and practical remediation guidance.</p>
        </div>
      </div>
      <div className="findings-list">
        {findings.map((finding) => (
          <article className={`finding finding-${finding.severity}`} key={finding.id}>
            <div className="finding-topline">
              <span className={`severity-badge severity-${finding.severity}`}>
                {severityLabel[finding.severity]}
              </span>
              <span className="rule-id">{finding.id}</span>
              <span className="rule-weight">{finding.weight} pts</span>
            </div>
            <h3>{finding.title}</h3>
            <dl>
              <div>
                <dt>Description</dt>
                <dd>{finding.description}</dd>
              </div>
              <div>
                <dt>Recommendation</dt>
                <dd>
                  {finding.severity === 'pass'
                    ? 'No action required.'
                    : finding.recommendation}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}
