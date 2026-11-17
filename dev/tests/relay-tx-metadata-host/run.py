"""Compile exact pinned SDK function: demonstrate upstream failure then patched success."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--sdk', required=True, type=Path)
parser.add_argument('--cc', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
source = 'framework/morselib/src/umac/relay/umac_relay.c'
original = subprocess.check_output(['git', '-C', str(args.sdk), 'show', '4c1df889b25a95dc4fb4819cb38fb3d390f3f3d5:' + source], text=True)
patched = (args.sdk / source).read_text()
fixture = Path(__file__).with_name('fixture.c').read_text()
args.output.mkdir(parents=True, exist_ok=True)
results = {}
for name, text, expected in [('upstream', original, 1), ('patched', patched, 0)]:
    start = text.index('void umac_relay_update_tx_metadata(')
    end = text.index('void umac_relay_handle_sta_state(', start)
    production = text[start:end]
    cfile = args.output / (name + '.c')
    cfile.write_text(fixture.replace('PRODUCTION_FUNCTION', production))
    executable = args.output / (name + '.exe')
    subprocess.run([str(args.cc), 'cc', '-std=c11', '-Wall', '-Wextra', '-Werror', str(cfile), '-o', str(executable)], check=True)
    run = subprocess.run([str(executable.resolve())], capture_output=True, text=True)
    print(name + ': ' + run.stdout.strip())
    if run.returncode != expected:
        raise SystemExit(name + ' did not demonstrate expected failure/success')
    results[name] = {'exit': run.returncode, 'stdout': run.stdout, 'production_function_sha256': hashlib.sha256(production.encode()).hexdigest()}
(args.output / 'result.json').write_text(json.dumps(results, indent=2) + '\n')
