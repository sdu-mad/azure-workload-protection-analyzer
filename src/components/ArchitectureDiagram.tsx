const resources = [
  { name: 'Container Registry', detail: 'sdusianalyzeracr' },
  { name: 'Container App', detail: 'sdusi-analyzer-app' },
  { name: 'Key Vault', detail: 'sdusi-analyzer-kv' },
  { name: 'Log Analytics', detail: 'sdusi-analyzer-law' },
]

export function ArchitectureDiagram() {
  return (
    <section className="architecture" aria-labelledby="architecture-title">
      <div className="architecture-copy">
        <span className="eyebrow">Reference workload</span>
        <h2 id="architecture-title">Protection architecture</h2>
        <p>
          The Container App pulls images from ACR, retrieves secrets from Key
          Vault, and sends telemetry to Log Analytics.
        </p>
      </div>
      <div className="architecture-flow" aria-label="Azure resource architecture diagram">
        {resources.map((resource, index) => (
          <div className="architecture-item" key={resource.name}>
            <div className="resource-box">
              <span>{resource.name}</span>
              <small>{resource.detail}</small>
            </div>
            {index < resources.length - 1 && (
              <span className="connector" aria-hidden="true">
                →
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
