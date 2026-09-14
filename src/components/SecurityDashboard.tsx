import type { AnalysisResult } from '../analyzer/types'
import { ScoreCard } from './ScoreCard'

interface SecurityDashboardProps {
  result: AnalysisResult
}

export function SecurityDashboard({ result }: SecurityDashboardProps) {
  return (
    <section className="section-block" aria-labelledby="dashboard-title">
      <div className="section-heading">
        <span className="section-number">02</span>
        <div>
          <h2 id="dashboard-title">Security Dashboard</h2>
          <p>Weighted readiness across core protection categories.</p>
        </div>
      </div>
      <ScoreCard score={result.score} status={result.status} />
      <div className="category-grid">
        {result.categories.map((category) => (
          <article className="category-card" key={category.category}>
            <div className="category-card-header">
              <h3>{category.category}</h3>
              <span className={`signal signal-${category.status}`} aria-hidden="true" />
            </div>
            <strong>{category.score}%</strong>
            <div className="category-meter" aria-hidden="true">
              <span style={{ width: `${category.score}%` }} />
            </div>
            <small>{category.possible} points available</small>
          </article>
        ))}
      </div>
    </section>
  )
}
