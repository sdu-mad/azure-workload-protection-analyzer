import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, posix, resolve } from 'node:path'
import { promisify } from 'node:util'
import { analyzeArmTemplate } from '../src/analyzer/analyze'
import type {
  AnalysisResult,
  ArmTemplate,
  BicepProject,
  CompilerDiagnostic,
} from '../src/analyzer/types'

const execFileAsync = promisify(execFile)
const COMPILER_TIMEOUT_MS = 15_000
const MAX_COMPILER_OUTPUT_BYTES = 5 * 1024 * 1024

const diagnosticPattern =
  /^(?<file>.+?)\((?<line>\d+),(?<column>\d+)\)\s*:\s*(?<level>Error|Warning)\s*(?<code>[A-Z0-9]+):\s*(?<message>.+)$/i

export class BicepCompilationError extends Error {
  constructor(
    message: string,
    readonly diagnostics: CompilerDiagnostic[],
  ) {
    super(message)
    this.name = 'BicepCompilationError'
  }
}

const parseDiagnostics = (output: string): CompilerDiagnostic[] =>
  output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): CompilerDiagnostic => {
      const match = diagnosticPattern.exec(line)
      if (!match?.groups) {
        return { level: 'error', message: line }
      }
      return {
        file: match.groups.file,
        line: Number(match.groups.line),
        column: Number(match.groups.column),
        level: match.groups.level.toLowerCase() as 'error' | 'warning',
        code: match.groups.code,
        message: match.groups.message,
      }
    })

const compilerCommand = (entrypoint: string) => {
  const configuredPath = process.env.BICEP_CLI_PATH
  if (configuredPath) {
    return {
      command: configuredPath,
      args: ['build', entrypoint, '--stdout', '--no-restore'],
    }
  }

  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec ?? 'cmd.exe',
      args: [
        '/d',
        '/c',
        'az',
        'bicep',
        'build',
        '--file',
        entrypoint,
        '--stdout',
        '--no-restore',
      ],
    }
  }

  return {
    command: 'bicep',
    args: ['build', entrypoint, '--stdout', '--no-restore'],
  }
}

const writeProject = async (root: string, project: BicepProject) => {
  for (const [filePath, contents] of Object.entries(project.files)) {
    const destination = resolve(root, ...filePath.split('/'))
    const expectedPrefix = `${resolve(root)}${process.platform === 'win32' ? '\\' : '/'}`
    if (!destination.startsWith(expectedPrefix)) {
      throw new Error(`Project file escapes the compilation directory: ${filePath}`)
    }
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, contents, 'utf8')
  }
}

export const analyzeBicepProject = async (
  project: BicepProject,
): Promise<AnalysisResult> => {
  const root = await mkdtemp(join(tmpdir(), 'cwp-bicep-'))
  try {
    await writeProject(root, project)
    const entrypoint = resolve(root, ...posix.normalize(project.entrypoint).split('/'))
    const invocation = compilerCommand(entrypoint)
    const { stdout, stderr } = await execFileAsync(
      invocation.command,
      invocation.args,
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: COMPILER_TIMEOUT_MS,
        maxBuffer: MAX_COMPILER_OUTPUT_BYTES,
        windowsHide: true,
      },
    )
    const diagnostics = parseDiagnostics(stderr).filter(
      (diagnostic) => diagnostic.level === 'warning',
    )
    const template = JSON.parse(stdout) as ArmTemplate
    return analyzeArmTemplate(template, {
      entrypoint: project.entrypoint,
      fileCount: Object.keys(project.files).length,
      diagnostics,
    })
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      ('stderr' in error || 'stdout' in error)
    ) {
      const stderr = 'stderr' in error ? String(error.stderr ?? '') : ''
      const stdout = 'stdout' in error ? String(error.stdout ?? '') : ''
      const diagnostics = parseDiagnostics(`${stderr}\n${stdout}`)
      throw new BicepCompilationError(
        'Bicep compilation failed.',
        diagnostics.length > 0
          ? diagnostics
          : [{ level: 'error', message: 'The Bicep compiler returned an error.' }],
      )
    }
    throw error
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    })
  }
}
