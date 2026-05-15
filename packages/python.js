(function () {
  var G = GASH;

  var pyodide = null;
  var pyLoadPromise = null;
  var origUpdatePrompt = null;

  function runPy(code) {
    pyodide.globals.set('__gash_code', code);
    var wrapper = [
      'import sys, io',
      '__gash_buf = io.StringIO()',
      '__gash_old = sys.stdout',
      'sys.stdout = __gash_buf',
      'try:',
      '    __gash_c = compile(__gash_code, "<gash>", "single")',
      '    exec(__gash_c)',
      'except Exception as __gash_e:',
      '    __gash_buf.write(str(__gash_e))',
      'finally:',
      '    sys.stdout = __gash_old',
      '__gash_buf.getvalue()'
    ].join('\n');
    try {
      var result = pyodide.runPython(wrapper);
      var str = String(result);
      pyodide.runPython('del __gash_code');
      return str;
    } catch (e) {
      pyodide.runPython('del __gash_code');
      return e.message;
    }
  }

  function hasAwait(code) {
    // Simple check for top-level await (outside function def)
    var inFn = false;
    for (var ci = 0; ci < code.length; ci++) {
      var ch = code[ci];
      if (ch === 'd' && code.slice(ci, ci + 8) === 'def ') inFn = true;
      if (ch === 'a' && code.slice(ci, ci + 5) === 'async') inFn = true;
      if (ch === '\n') inFn = false;
    }
    return !inFn && /\bawait\b/.test(code);
  }

  async function runPyAsync(code) {
    pyodide.globals.set('__gash_code', code);
    var wrapper = [
      'import sys, io',
      '__gash_buf = io.StringIO()',
      '__gash_old = sys.stdout',
      'sys.stdout = __gash_buf',
      'try:',
      '    exec(compile(__gash_code, "<gash>", "single"))',
      'except Exception as __gash_e:',
      '    __gash_buf.write(str(__gash_e))',
      'finally:',
      '    sys.stdout = __gash_old',
      '__gash_buf.getvalue()'
    ].join('\n');
    try {
      var result = await pyodide.runPythonAsync(wrapper);
      var str = String(result);
      pyodide.runPython('del __gash_code');
      return str;
    } catch (e) {
      pyodide.runPython('del __gash_code');
      return e.message;
    }
  }

  function ensurePyodide(ctx) {
    if (pyodide) return Promise.resolve(pyodide);
    if (pyLoadPromise) return pyLoadPromise;
    ctx.addToConsole('> Loading Pyodide (WebAssembly Python)...');
    ctx.addToConsole('> This may take a moment on first load.');
    pyLoadPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
      script.onload = async function () {
        try {
          pyodide = await loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/'
          });
          ctx.addToConsole('> \ud83d\udfe2 Pyodide loaded! Python ' + pyodide.version);
          // Pre-load micropip so pip install works
          try { await pyodide.loadPackage(['micropip']); } catch (e) { /* non-fatal */ }
          resolve(pyodide);
        } catch (e) {
          reject(e);
        }
      };
      script.onerror = function () {
        reject(new Error('Failed to load Pyodide from CDN'));
      };
      document.head.appendChild(script);
    });
    return pyLoadPromise;
  }

  var HELP = [
    'Python - Run Python code via Pyodide (WebAssembly)',
    '',
    '  Usage:',
    '    python repl           Interactive Python REPL',
    '    python -c <code>      Run inline Python code',
    '    python <code>         Run inline code (if no matching file)',
    '    python <file>         Run Python script from VFS',
    '    python --help         Show this help',
    '',
    '  REPL commands:',
    '    exit() or quit()      Exit the Python REPL',
    '',
    '  Examples:',
    '    python print("hello world")',
    '    python -c "import math; print(math.pi)"',
    '    python /home/script.py'
  ].join('\n');

  G.register('python', async function (args, ctx) {
    if (!args.length || args[0] === '--help') {
      return '> ' + HELP.split('\n').join('\n> ');
    }

    var first = args[0];

    // ─── REPL MODE ──────────────────────────────────────────────
    if (first === 'repl') {
      if (G.inputHook) return '> already in REPL mode (type exit() to quit)';
      try {
        await ensurePyodide(ctx);
      } catch (e) {
        return '> error: ' + e.message;
      }

      G.inputHook = async function (line) {
        if (line === 'exit()' || line === 'quit()' || line === 'exit' || line === 'quit') {
          G.addToConsole('> leaving Python REPL');
          G.inputHook = null;
          if (origUpdatePrompt) {
            G._updatePrompt = origUpdatePrompt;
            origUpdatePrompt = null;
          }
          G._updatePrompt();
          return;
        }
        var output = hasAwait(line) ? await runPyAsync(line) : runPy(line);
        if (output) {
          G.addToConsole('> ' + output.replace(/\n$/, '').split('\n').join('\n> '));
        }
      };

      origUpdatePrompt = G._updatePrompt;
      G._updatePrompt = function () {
        if (G.inputHook) {
          document.getElementById('prompt-label').textContent = '>>> ';
        } else {
          origUpdatePrompt.call(G);
        }
        var inp = document.getElementById('input-field');
        if (inp && document.activeElement !== inp) inp.focus();
      };
      G._updatePrompt();
      return '> Python REPL started. Type code directly. exit() to quit.';
    }

    // ─── LOAD PYODIDE ───────────────────────────────────────────
    try {
      await ensurePyodide(ctx);
    } catch (e) {
      return '> error: ' + e.message;
    }

    // ─── INLINE CODE / SCRIPT ───────────────────────────────────
    var code;

    if (first === '-c') {
      code = args.slice(1).join(' ');
      if (!code) return '> error: -c requires code';
    } else {
      // Check if it's a VFS file
      try {
        var normalized = ctx.fs.normalizePath(first);
        var exists = await ctx.fs.exists(normalized);
        if (exists) {
          var isDir = await ctx.fs.isDirectory(normalized);
          if (!isDir) {
            code = await ctx.fs.readFile(normalized);
          }
        }
      } catch (e) { /* not a file */ }

      if (code === undefined) {
        code = args.join(' ');
      }
    }

    if (!code) return '> error: no code provided';

    var output = hasAwait(code) ? await runPyAsync(code) : runPy(code);
    if (output) {
      return '> ' + output.replace(/\n$/, '').split('\n').join('\n> ');
    }
    return null;
  }, HELP, 'pkg');

  // ─── PIP: Python package manager via micropid ──────────────────

  var PIP_HELP = [
    'pip - Python package manager for Pyodide',
    '',
    '  Usage:',
    '    pip install <pkg>    Install a Python package from PyPI',
    '    pip list              List installed packages',
    '    pip freeze            List installed packages (pip format)',
    '    pip uninstall <pkg>   Uninstall a package',
    '    pip --help            Show this help',
    '',
    '  Examples:',
    '    pip install requests',
    '    pip list'
  ].join('\n');

  G.register('pip', async function (args, ctx) {
    if (!args.length || args[0] === '--help') {
      return '> ' + PIP_HELP.split('\n').join('\n> ');
    }

    try {
      await ensurePyodide(ctx);
    } catch (e) {
      return '> error: ' + e.message;
    }

    var sub = args[0];

    if (sub === 'install') {
      var pkgName = args[1];
      if (!pkgName) return '> error: usage: pip install <package>';
      ctx.addToConsole('> Installing ' + pkgName + '...');
      try {
        pyodide.globals.set('__gash_pkg', pkgName);
        await pyodide.runPythonAsync('import micropip; await micropip.install(__gash_pkg)');
        pyodide.runPython('del __gash_pkg');
        return '> \u2705 Installed "' + pkgName + '"';
      } catch (e) {
        pyodide.runPython('del __gash_pkg');
        return '> error: ' + e.message;
      }
    }

    if (sub === 'list' || sub === 'freeze') {
      try {
        var result = pyodide.runPython([
          'import importlib.metadata',
          'pkgs = []',
          'for dist in importlib.metadata.distributions():',
          '    name = dist.metadata.get("Name", dist.metadata["name"])',
          '    ver = dist.version',
          '    pkgs.append(name + "==" + ver)',
          'pkgs.sort()',
          'str(pkgs)'
        ].join('\n'));
        var list = JSON.parse(result.replace(/'/g, '"'));
        if (!list.length) return '> (no packages installed)';
        return '> ' + list.join('\n> ');
      } catch (e) {
        return '> error: ' + e.message;
      }
    }

    if (sub === 'uninstall') {
      var pkgName = args[1];
      if (!pkgName) return '> error: usage: pip uninstall <package>';
      try {
        pyodide.runPython([
          'import shutil, importlib, sys',
          'try:',
          '    dist = importlib.metadata.distribution("' + pkgName.replace(/"/g, '') + '")',
          '    path = dist._path',
          '    shutil.rmtree(path)',
          '    sys.modules.pop("' + pkgName.replace(/"/g, '') + '", None)',
          'except Exception as e:',
          '    raise Exception("could not uninstall: " + str(e))'
        ].join('\n'));
        return '> \u2705 Uninstalled "' + pkgName + '"';
      } catch (e) {
        return '> error: ' + e.message;
      }
    }

    return '> usage: pip <install|list|freeze|uninstall>';
  }, PIP_HELP, 'pkg');

  G.addToConsole('> \ud83d\udc0d python package loaded. Try: python repl');
})();
