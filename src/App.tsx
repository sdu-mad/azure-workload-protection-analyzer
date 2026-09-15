import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnalysisResult } from './analyzer/types'
import {
  AnalysisApiError,
  analyzeWorkload,
  getHealth,
} from './api/client'
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
  const [compilerErrors, setCompilerErrors] = useState<string[]>([])
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>(
    'checking',
  )
  const analysisRequestId = useRef(0)

  const runAnalysis = useCallback(async (bicepSource: string) => {
    const requestId = ++analysisRequestId.current
    setIsAnalyzing(true)
    setAnalysisError(null)
    setCompilerErrors([])

    try {
      const nextResult = await analyzeWorkload(bicepSource)
      if (requestId === analysisRequestId.current) {
        setResult(nextResult)
      }
    } catch (error) {
      if (requestId !== analysisRequestId.current) {
        return
      }
      setAnalysisError(
        error instanceof Error ? error.message : 'The analysis request failed.',
      )
      if (error instanceof AnalysisApiError) {
        setCompilerErrors(
          error.diagnostics.map((diagnostic) => {
            const location =
              diagnostic.file && diagnostic.line && diagnostic.column
                ? `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} `
                : ''
            return `${location}${diagnostic.code ? `${diagnostic.code}: ` : ''}${diagnostic.message}`
          }),
        )
      }
    } finally {
      if (requestId === analysisRequestId.current) {
        setIsAnalyzing(false)
      }
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
            Compile and inspect Azure Bicep workloads against identity, secrets,
            registry, network, runtime, and monitoring controls. Findings use
            effective ARM resources and include evidence for review.
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
            <div className="analysis-error" role="alert">
              <strong>Analysis failed: {analysisError}</strong>
              {compilerErrors.length > 0 && (
                <ul>
                  {compilerErrors.map((diagnostic) => (
                    <li key={diagnostic}>{diagnostic}</li>
                  ))}
                </ul>
              )}
            </div>
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
        <p>Cloud Workload Protection Readiness Analyzer · Semantic Bicep security analysis</p>
      </footer>
    </>
  )
}

export default App
