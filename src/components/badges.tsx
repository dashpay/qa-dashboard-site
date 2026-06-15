import type { ImplStatus, RunResult } from '../sdk/types';
import { IMPL_STATUS_LABEL, RESULT_LABEL } from '../sdk/types';

export function ResultBadge({ result }: { result: RunResult }) {
  return (
    <span className={`badge result result-${result}`} title={RESULT_LABEL[result]}>
      {RESULT_LABEL[result]}
    </span>
  );
}

export function ImplBadge({ status }: { status: ImplStatus }) {
  return (
    <span className={`badge impl impl-${status}`} title={IMPL_STATUS_LABEL[status]}>
      {IMPL_STATUS_LABEL[status]}
    </span>
  );
}
