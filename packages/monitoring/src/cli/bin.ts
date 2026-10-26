#!/usr/bin/env node
import { runCli } from './index'

void Promise.resolve(runCli(process.argv.slice(2), process.cwd())).then(
  (code) => {
    process.exitCode = code
  },
)
