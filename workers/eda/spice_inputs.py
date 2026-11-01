"""Keep native ngspice filenames ASCII without moving the user's workspace.

Some Windows builds convert argv and SPICE filenames through the system ANSI
code page. Python still supplies the real Unicode cwd through CreateProcessW.
Copy the already validated input graph to ASCII names in that run directory;
only file-reference tokens change. Original artifacts and PDK files stay intact.
"""
import hashlib
from pathlib import Path
import re
import uuid


REFERENCE = re.compile(r'(?mi)^(?P<prefix>[ \t]*(?P<kind>\.include|\.inc|\.lib|source)[ \t]+)(?P<token>"[^"\r\n]+"|\x27[^\x27\r\n]+\x27|[^\s]+)(?P<tail>[^\r\n]*)')


class SpiceInputError(ValueError):
    pass


def prepare(folder, command):
    """Return actual argv and hash-bound input-copy provenance for one run.

    The engine emits `ngspice -b <deck>`; other invocations are untouched. No
    shell, short-path alias, locale mutation, or original source rewrite is used.
    """
    argv = list(command)
    if len(argv) != 3 or Path(argv[0]).name.lower() not in ('ngspice', 'ngspice.exe') or argv[1] != '-b':
        return argv, None
    cwd = Path(folder).resolve()
    deck = Path(argv[2])
    deck = (deck if deck.is_absolute() else cwd/deck).resolve()
    if not deck.is_relative_to(cwd) or not deck.is_file():
        raise SpiceInputError('The generated ngspice deck must belong to its run directory.')
    prefix = 'ngspice-input-' + uuid.uuid4().hex[:12] + '-'
    copied, records, total = {}, [], 0

    def copy_input(source, depth=0):
        nonlocal total
        source = source.resolve()
        if source in copied:
            return copied[source]
        if depth > 32 or len(copied) >= 2048:
            raise SpiceInputError('SPICE input dependency graph exceeds its bound.')
        try:
            data = source.read_bytes()
            content = data.decode('utf-8')
        except (OSError, UnicodeError) as error:
            raise SpiceInputError('SPICE dependency is missing or is not supported UTF-8 text.') from error
        total += len(data)
        if total > 512*1024*1024:
            raise SpiceInputError('SPICE input dependency graph exceeds 512 MiB.')
        name = prefix + str(len(copied)).zfill(4) + '.spice'
        copied[source] = name

        def reference(match):
            kind, tail = match['kind'].lower(), match['tail']
            if kind == 'source':
                controls=re.findall(r'(?mi)^[ \t]*\.(control|endc)\b',content[:match.start()])
                if not controls or controls[-1].lower()!='control':
                    return match[0]
            # `.lib tt` declares a section; `.lib file tt` loads a file.
            if kind == '.lib' and (not tail.strip() or tail.lstrip().startswith(('$', ';', '*'))):
                return match[0]
            token = match['token']
            value = token[1:-1] if token.startswith(('"', "'")) else token
            dependency = Path(value.replace('\\', '/'))
            if not dependency.is_absolute():
                local = source.parent/dependency
                dependency = local if local.is_file() else cwd/dependency
            if not dependency.is_file():
                raise SpiceInputError('A declared SPICE input dependency cannot be resolved before execution.')
            # Every copied file has the same parent as cwd. Both ngspice include
            # search orders therefore resolve this bare ASCII name identically.
            replacement = copy_input(dependency, depth+1)
            return match['prefix'] + ('"'+replacement+'"' if kind != 'source' else replacement) + tail

        output = REFERENCE.sub(reference, content).encode('utf-8')
        (cwd/name).write_bytes(output)
        records.append({'source':str(source), 'source_sha256':hashlib.sha256(data).hexdigest(),
                        'execution_file':name, 'execution_sha256':hashlib.sha256(output).hexdigest()})
        return name

    argv[2] = copy_input(deck)
    return argv, {'method':'ascii-relative-input-copies', 'original_deck':str(deck),
                  'execution_deck':argv[2], 'files':records}
