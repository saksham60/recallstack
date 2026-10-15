import type { ExecutionRequest } from "@/features/dsa/execution/contract";
import { ExecutionError, type EvaluationPlan } from "./types";

export function executionPayload(
  request: ExecutionRequest,
  plan: EvaluationPlan,
): string {
  const input = JSON.stringify({
    code: request.code,
    contract: plan.contract,
    cases: plan.cases.map(({ id, input }) => ({ id, input })),
  });
  if (Buffer.byteLength(input) > 131072)
    throw new ExecutionError(
      "INPUT_LIMIT",
      "Execution input exceeds the supported limit.",
      409,
    );
  return input;
}

/** Fixed supervisor executed only inside ConTree. Expected outputs never enter it.
 * The supervisor runs as root; each solution process drops to uid/gid 65534.
 * The user process cannot signal the supervisor or alter its result stream.
 */
export const PYTHON_SUPERVISOR = String.raw`
import json, os, resource, selectors, signal, subprocess, sys, time
resource.setrlimit(resource.RLIMIT_AS, (536870912, 536870912))
resource.setrlimit(resource.RLIMIT_FSIZE, (1048576, 1048576))
resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
payload = json.loads(sys.stdin.buffer.read(131073))
child = r'''
import json, resource, sys, traceback
resource.setrlimit(resource.RLIMIT_AS, (268435456, 268435456))
resource.setrlimit(resource.RLIMIT_CPU, (2, 2))
resource.setrlimit(resource.RLIMIT_NPROC, (0, 0))
resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
resource.setrlimit(resource.RLIMIT_FSIZE, (1048576, 1048576))
request = json.loads(sys.stdin.buffer.read(131073))
try:
    scope = {'__name__': 'solution'}
    exec(compile(request['code'], 'solution.py', 'exec'), scope)
    fn = scope[request['entrypoint']]
    value = request['input']
    result = fn(**value) if request['inputMode'] == 'kwargs' else fn(*value) if request['inputMode'] == 'args' else fn(value)
    print('\n__REASONAI_RESULT__' + json.dumps(result, allow_nan=False, separators=(',', ':')))
except SyntaxError:
    traceback.print_exc(limit=3)
    sys.exit(65)
except BaseException:
    traceback.print_exc(limit=3)
    sys.exit(70)
'''
deadline = time.monotonic() + 22
results = []
budget = 48000
for case in payload['cases']:
    row = {'id': case['id'], 'status': 'runtime_error'}
    started = time.perf_counter()
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        row['status'] = 'time_limit_exceeded'
        results.append(row)
        continue
    data = json.dumps({'code': payload['code'], 'entrypoint': payload['contract']['entrypoint'], 'inputMode': payload['contract']['inputMode'], 'input': case['input']}).encode()
    process = subprocess.Popen(['/usr/local/bin/python3', '-I', '-c', child], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env={}, user=65534, group=65534, extra_groups=[], start_new_session=True)
    output, errors = bytearray(), bytearray()
    selector = selectors.DefaultSelector()
    os.set_blocking(process.stdin.fileno(), False)
    selector.register(process.stdin, selectors.EVENT_WRITE, 'input')
    selector.register(process.stdout, selectors.EVENT_READ, 'stdout')
    selector.register(process.stderr, selectors.EVENT_READ, 'stderr')
    position = 0
    reason = None
    try:
        while selector.get_map():
            if time.perf_counter() - started > min(3, remaining):
                reason = 'time_limit_exceeded'
                break
            for key, _ in selector.select(0.02):
                if key.data == 'input':
                    try:
                        position += os.write(key.fileobj.fileno(), data[position:position+4096])
                    except BrokenPipeError:
                        position = len(data)
                    if position >= len(data):
                        selector.unregister(key.fileobj)
                        key.fileobj.close()
                else:
                    chunk = os.read(key.fileobj.fileno(), 4096)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        continue
                    target = output if key.data == 'stdout' else errors
                    target.extend(chunk)
                    if len(output) > 16384 or len(errors) > 4096:
                        reason = 'output_limit_exceeded'
                        break
            if reason:
                break
    finally:
        selector.close()
        if reason:
            try: os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError: pass
        try: process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            reason = 'time_limit_exceeded'
            try: os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError: pass
            process.wait(timeout=1)
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream and not stream.closed: stream.close()
    row['executionTimeMs'] = round((time.perf_counter()-started)*1000)
    row['stdout'] = output[:4096].decode('utf-8', 'replace')
    row['stderr'] = errors[:4096].decode('utf-8', 'replace')
    if reason:
        row['status'] = reason
    elif process.returncode == 65:
        row['status'] = 'syntax_error'
    elif process.returncode == -signal.SIGXCPU or process.returncode == -signal.SIGKILL:
        row['status'] = 'time_limit_exceeded'
    elif process.returncode == 0:
        try:
            text = output.decode('utf-8')
            before, marker, value = text.rpartition('\n__REASONAI_RESULT__')
            if not marker: raise ValueError('missing result')
            row['actual'] = json.loads(value)
            row['stdout'] = before[:4096]
            row['status'] = 'ok'
        except (ValueError, UnicodeError):
            row['status'] = 'runtime_error'
    encoded = json.dumps(row, ensure_ascii=True)
    if len(encoded) > budget:
        row = {'id': case['id'], 'status': 'output_limit_exceeded'}
    budget -= len(json.dumps(row, ensure_ascii=True))
    results.append(row)
print(json.dumps({'cases': results, 'memoryKiB': resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss}, ensure_ascii=True, allow_nan=False, separators=(',', ':')))
`;
