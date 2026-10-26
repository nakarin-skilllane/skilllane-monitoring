import { errorsCheck } from './errors-check'
import { errorsInit } from './errors-init'

const USAGE = `usage:
  skilllane-monitoring errors init  [--path src/skilllane-monitoring/errors.ts] [--min-repeat 5]
  skilllane-monitoring errors check [--path src/skilllane-monitoring/errors.ts]`

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

/** The command line, without side effects at import: bin.ts runs it. */
export function runCli(
  argv: string[],
  cwd: string,
  out: (line: string) => void = (l) => console.log(l),
): number {
  const [group, command] = argv
  const path = flag(argv, '--path')
  if (group === 'errors' && command === 'init') {
    const minRepeat = Number(flag(argv, '--min-repeat') ?? 5)
    return errorsInit({
      cwd,
      path,
      minRepeat: Number.isFinite(minRepeat) && minRepeat > 0 ? minRepeat : 5,
      out,
    })
  }
  if (group === 'errors' && command === 'check') {
    return errorsCheck({ cwd, path, out })
  }
  out(USAGE)
  return 64
}
