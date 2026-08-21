// Errors that carry the status they deserve.
//
// Every validation failure in the onboarding runtime was answering 500. Sending "your
// justification is too short" as a server error is wrong in a way that costs something:
// a 500 is a promise that retrying might work and that someone should be paged, and
// neither is true. A caller cannot tell "you sent the wrong thing" from "we broke", and
// monitoring cannot either.
//
// The runtime's errorStatus() already honours an explicit `status` on a thrown error --
// that is how KindeSessionError produces a 401. This gives the same mechanism a name so
// input checks can use it, rather than pattern-matching messages downstream, which would
// turn every reworded error message into a silent status change.

/** An error the caller can fix by sending something different. */
export class ClientError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ClientError';
    this.status = status;
  }
}

/** The request was well-formed but conflicts with state that already exists. */
export function conflict(message: string) {
  return new ClientError(message, 409);
}

/** The request names something that is not there. */
export function notFound(message: string) {
  return new ClientError(message, 404);
}

/**
 * Maps a PostgreSQL SQLSTATE to a status, for errors that come back from the database
 * rather than from our own checks.
 *
 * Only the classes where the caller is unambiguously at fault are mapped. Everything
 * else keeps its default, because guessing that a database error is the caller's fault
 * is how a real outage gets reported as a bad request.
 */
export function statusFromSqlState(code: unknown) {
  const sqlState = String(code ?? '').trim();
  if (sqlState === '23505') return 409; // unique_violation
  if (sqlState === '23503') return 409; // foreign_key_violation
  if (sqlState === '23514') return 400; // check_violation
  if (sqlState === '23502') return 400; // not_null_violation
  if (sqlState === '22P02') return 400; // invalid_text_representation
  if (sqlState === '22023') return 400; // invalid_parameter_value
  return null;
}
