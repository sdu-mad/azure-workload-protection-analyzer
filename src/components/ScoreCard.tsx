interface ScoreCardProps {
  score: number
  status: string
}

export function ScoreCard({ score, status }: ScoreCardProps) {
  const circumference = 2 * Math.PI * 54
  const offset = circumference - (score / 100) * circumference

  return (
    <article className="score-card">
      <div className="score-copy">
        <span className="eyebrow">Readiness score</span>
        <h2>{status}</h2>
        <p>Weighted result across six cloud workload protection checks.</p>
        <span className={`status-badge status-${status.toLowerCase().replaceAll(' ', '-')}`}>
          {status}
        </span>
      </div>
      <div className="score-ring" aria-label={`Readiness score: ${score} out of 100`}>
        <svg viewBox="0 0 128 128" role="img">
          <circle className="ring-track" cx="64" cy="64" r="54" />
          <circle
            className="ring-progress"
            cx="64"
            cy="64"
            r="54"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="score-value">
          <strong>{score}</strong>
          <span>/ 100</span>
        </div>
      </div>
    </article>
  )
}
