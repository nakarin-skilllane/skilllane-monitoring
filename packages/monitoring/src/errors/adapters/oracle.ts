import type { ErrorAdapter } from './types'

const CODE = /^(ORA|NJS|DPI)-\d{3,5}/

function oracleCode(error: any): string | undefined {
  if (typeof error?.code === 'string' && CODE.test(error.code)) {
    return error.code.match(CODE)![0]
  }
  if (typeof error?.errorNum === 'number' && error.errorNum > 0) {
    return `ORA-${String(error.errorNum).padStart(5, '0')}`
  }
  const fromMessage =
    typeof error?.message === 'string' ? error.message.match(CODE) : null
  return fromMessage?.[0]
}

/** The driver's own string code when it is not Oracle: pg `23505`, mysql `ER_DUP_ENTRY`. */
function driverCode(error: any): string | undefined {
  return typeof error?.code === 'string' && error.code ? error.code : undefined
}

// node-oracledb errors and TypeORM QueryFailedError wrapping them. The error
// line reads neither the query text nor the bind values: both are on the
// db span (db.statement, skilllane.monitoring.db.parameters, masked; src/capture/db.ts).
// A QueryFailedError from another driver (pg, mysql) keeps that driver's code
// and no dependency, so the generic SQLSTATE / ER_ patterns apply.
export const oracleAdapter: ErrorAdapter = {
  name: 'oracle',
  match: (error) =>
    typeof error?.errorNum === 'number' ||
    (error?.name === 'QueryFailedError' && error?.driverError !== undefined) ||
    (typeof error?.code === 'string' && CODE.test(error.code)) ||
    (typeof error?.message === 'string' && CODE.test(error.message)),
  extract: (error) => {
    const driverError =
      error?.name === 'QueryFailedError' ? error.driverError : undefined
    const oracle = oracleCode(error) ?? oracleCode(driverError)
    return {
      code: oracle ?? driverCode(driverError) ?? driverCode(error),
      cause: driverError && driverError !== error ? driverError : error?.cause,
      dependency: oracle ? 'oracle' : undefined,
    }
  },
}
