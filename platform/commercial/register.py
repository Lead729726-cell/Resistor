"""Private operator CLI for a worker; never accepts or prints credential values."""
import argparse
import json
import os
from pathlib import Path
import urllib.request
import urllib.parse


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--url', default='http://127.0.0.1:8765')
    parser.add_argument('--worker-token-file', default='/run/secrets/worker_session')
    parser.add_argument('--agent-token-source')
    args = parser.parse_args()
    url = urllib.parse.urlsplit(args.url)
    if url.scheme != 'http' or url.hostname not in ('127.0.0.1', 'localhost', '::1') or url.username or url.password or url.path not in ('', '/') or url.query or url.fragment:
        parser.error('Run the operator CLI on the worker host through loopback HTTP.')
    manifest_path = Path(args.manifest)
    if not manifest_path.is_file() or manifest_path.stat().st_size > 128 * 1024:
        parser.error('Bounded local manifest file required.')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
    if args.agent_token_source:
        runner = manifest.get('runner', {})
        if runner.get('kind') != 'agent':
            parser.error('Token provisioning requires an agent profile.')
        target = Path(runner.get('token_file', '')).resolve()
        root = Path('/workspace/.runtime/eda/backend-private').resolve()
        if not target.is_relative_to(root) or target == root or target.is_symlink():
            parser.error('Worker agent token must stay inside /workspace/.runtime/eda/backend-private/.')
        source = Path(args.agent_token_source)
        if not source.is_file() or source.stat().st_size > 1024:
            parser.error('Private token source file is unavailable or oversized.')
        token = source.read_bytes().strip()
        if not 32 <= len(token) <= 512 or b'\n' in token or b'\r' in token:
            parser.error('Private source token format is invalid.')
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, 'wb') as stream:
                stream.write(token)
        except Exception:
            try: os.close(fd)
            except OSError: pass
            raise
    token = Path(args.worker_token_file).read_text().strip()
    request = urllib.request.Request(args.url.rstrip('/') + '/rpc', json.dumps({'method': 'backend.register', 'params': {'manifest': manifest}}).encode(),
        {'Content-Type': 'application/json', 'X-MOS-Token': token}, method='POST')
    # Fixed origin; redirects must never forward worker credentials.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            raise RuntimeError('Worker redirects are forbidden.')
    with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
        data = response.read(256 * 1024 + 1)
    if len(data) > 256 * 1024:
        raise RuntimeError('Worker metadata response is oversized.')
    result = json.loads(data)
    if not result.get('ok'):
        # Print only typed error codes; operator paths and credentials remain private.
        raise RuntimeError('Backend registration failed: ' + result.get('error', {}).get('code', 'UNKNOWN'))
    profile = result['result']
    print(json.dumps({key: profile.get(key) for key in ('id', 'tool_id', 'runner', 'available', 'status', 'fingerprint')}, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Do not expose URLs, headers, path values or exception bodies.
        import sys
        print(str(error) if isinstance(error, RuntimeError) else 'Operator setup failed; inspect private files and worker availability.', file=sys.stderr)
        sys.exit(1)
