interface BicepEditorProps {
  value: string
  onChange: (value: string) => void
  onAnalyze: () => void | Promise<void>
  isAnalyzing: boolean
}

export function BicepEditor({
  value,
  onChange,
  onAnalyze,
  isAnalyzing,
}: BicepEditorProps) {
  return (
    <div className="editor-shell">
      <div className="editor-toolbar">
        <span>Bicep template</span>
        <span className="editor-language">BICEP</span>
      </div>
      <label className="sr-only" htmlFor="bicep-editor">
        Bicep source code
      </label>
      <textarea
        id="bicep-editor"
        className="bicep-editor"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
      <button
        className="primary-button"
        type="button"
        onClick={onAnalyze}
        disabled={isAnalyzing || value.trim().length === 0}
      >
        {isAnalyzing ? 'Analyzing…' : 'Analyze workload'}
      </button>
    </div>
  )
}
