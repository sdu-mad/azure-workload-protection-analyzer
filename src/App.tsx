import { useCallback, useEffect, useState } from 'react'
import type { AnalysisResult } from './analyzer/types'
import { analyzeWorkload, getHealth } from './api/client'
import { ArchitectureDiagram } from './components/ArchitectureDiagram'
import { BicepEditor } from './components/BicepEditor'
import { FindingsPanel } from './components/FindingsPanel'
import { SecurityDashboard } from './components/SecurityDashboard'
import insecureSample from './samples/insecure-workload.bicep?raw'
import secureSample from './samples/secure-workload.bicep?raw'

type SampleName = 'insecure' | 'secure'

const samples: Record<SampleName, string> = {
  insecure: insecureSample,
  secure: secureSample,
}

function App() {
  const [source, setSource] = useState(insecureSample)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>(
    'checking',
  )

  const runAnalysis = useCallback(async (bicepSource: string) => {
    setIsAnalyzing(true)
    setAnalysisError(null)

    try {
      setResult(await analyzeWorkload(bicepSource))
    } catch (error) {
      setAnalysisError(
        error instanceof Error ? error.message : 'The analysis request failed.',
      )
    } finally {
      setIsAnalyzing(false)
    }
  }, [])

  useEffect(() => {
    void runAnalysis(insecureSample)
    void getHealth()
      .then(() => setApiStatus('online'))
      .catch(() => setApiStatus('offline'))
  }, [runAnalysis])

  const loadSample = (sample: SampleName) => {
    const nextSource = samples[sample]
    setSource(nextSource)
    void runAnalysis(nextSource)
  }

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#top" aria-label="Analyzer home">
            <span className="brand-mark">CWP</span>
            <span>Readiness Analyzer</span>
          </a>
          <span className={`local-badge api-${apiStatus}`}>
            API {apiStatus}
          </span>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <span className="eyebrow">Azure Infrastructure as Code</span>
          <h1>Cloud Workload Protection Readiness Analyzer</h1>
          <p>
            Inspect a fictional Azure Bicep workload against identity, secrets,
            registry, network, and monitoring controls. This portfolio project
            is an educational readiness aid, not a production security scanner.
          </p>
          <div className="scope-row">
            <span>Subscription: sub-sdusi-demo</span>
            <span>Resource group: sdusi-analyzer-rg</span>
          </div>
        </section>

        <ArchitectureDiagram />

        <section className="section-block input-section" aria-labelledby="input-title">
          <div className="section-heading">
            <span className="section-number">01</span>
            <div>
              <h2 id="input-title">Workload Input</h2>
              <p>Load a sample or paste Bicep code for server-side evaluation.</p>
            </div>
          </div>
          <div className="sample-control">
            <label htmlFor="sample-select">Sample workload</label>
            <select
              id="sample-select"
              defaultValue="insecure"
              onChange={(event) => loadSample(event.target.value as SampleName)}
            >
              <option value="insecure">Load Insecure Sample</option>
              <option value="secure">Load Secure Sample</option>
            </select>
          </div>
          <BicepEditor
            value={source}
            onChange={setSource}
            onAnalyze={() => runAnalysis(source)}
            isAnalyzing={isAnalyzing}
          />
          {analysisError && (
            <p className="analysis-error" role="alert">
              Analysis failed: {analysisError}
            </p>
          )}
        </section>

        {result ? (
          <>
            <SecurityDashboard result={result} />
            <FindingsPanel findings={result.findings} />
          </>
        ) : (
          <section className="section-block loading-panel" aria-live="polite">
            <h2>Security analysis</h2>
            <p>
              {isAnalyzing
                ? 'Waiting for the analysis API…'
                : 'No analysis result is available.'}
            </p>
          </section>
        )}
      </main>

      <footer>
        <p>Cloud Workload Protection Readiness Analyzer · Full-stack portfolio demo</p>
      </footer>
    </>
  )
}

export default App
