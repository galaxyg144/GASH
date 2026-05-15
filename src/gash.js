(function () {
  'use strict';

  const G = window.GASH;
  G.version = '2.0.0';

  // ─── STATE ──────────────────────────────────────────────────────

  G.vars = {
    PWD: '/',
    HOME: '/',
    USER: 'gashuser',
    SHELL: 'GASH',
    _intHeaders: '{}'
  };
  G.aliases = {};
  G.config = { theme: 'default', prompt: 'GASH' };
  G.history = [];
  G.historyIndex = -1;
  G.socket = null;
  G.waitingForFunction = null;
  G.gashFunctions = {};
  G.gashPackages = {};
  G.editorMode = false;
  G.filteredHistory = [];
  G.historySearchMode = false;
  G.historySearchQuery = '';
  G.jobs = {};
  G.nextJobId = 1;

  // ─── DOM REFS ───────────────────────────────────────────────────

  const inputField = document.getElementById('input-field');
  const consoleOutput = document.getElementById('console-output');
  const promptLabel = document.getElementById('prompt-label');

  // ─── HELPERS ────────────────────────────────────────────────────

  G.addToConsole = function (text, cls) {
    if (text == null || text === '') return;
    const clsAttr = cls ? ` class="${cls}"` : '';
    consoleOutput.innerHTML += `<div${clsAttr}><span class="prompt-gash">&gt; </span>${text}</div>`;
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  };

  G._clearConsole = function () {
    const welcome = `Welcome to GASH - Galaxy's Developer Shell v${G.version}\nType your commands below...\nType 'help' for available commands.`;
    consoleOutput.innerHTML = `<div><span class="prompt-gash">&gt; </span>${welcome.replace(/\n/g, '<br>')}</div>`;
  };

  G._updatePrompt = function () {
    if (!promptLabel) return;
    if (G.editorMode) {
      promptLabel.textContent = `EDIT:${G.editor.filename}> `;
    } else if (G.inputHook) {
      promptLabel.textContent = `>>> `;
    } else if (G.waitingForFunction) {
      promptLabel.textContent = `func> `;
    } else if (G.historySearchMode) {
      promptLabel.textContent = `(search) `;
    } else {
      const cwd = G.vars.PWD || '/';
      const user = G.vars.USER || 'gashuser';
      const host = G.hostname || 'gashbox';
      const home = G.vars.HOME || '/home/' + user;
      const display = cwd === home ? '~' : cwd;
      promptLabel.textContent = `${user}@${host}:${display}$ `;
    }
    if (inputField && document.activeElement !== inputField) {
      inputField.focus();
    }
  };

  G._saveFunctions = function () {
    try {
      localStorage.setItem('gashFunctions', JSON.stringify(G.gashFunctions));
    } catch (e) { /* ignore */ }
  };

  G._savePackages = function () {
    try {
      localStorage.setItem('gashPackages', JSON.stringify(G.gashPackages));
    } catch (e) { /* ignore */ }
  };

  G._saveAliases = function () {
    try {
      localStorage.setItem('gashAliases', JSON.stringify(G.aliases));
    } catch (e) { /* ignore */ }
  };

  G._saveConfig = function () {
    try {
      localStorage.setItem('gashConfig', JSON.stringify(G.config));
    } catch (e) { /* ignore */ }
  };

  G._loadState = function () {
    try {
      const fns = localStorage.getItem('gashFunctions');
      if (fns) G.gashFunctions = JSON.parse(fns);
    } catch (e) { /* ignore */ }
    try {
      const pkgs = localStorage.getItem('gashPackages');
      if (pkgs) G.gashPackages = JSON.parse(pkgs);
    } catch (e) { /* ignore */ }
    try {
      const als = localStorage.getItem('gashAliases');
      if (als) G.aliases = JSON.parse(als);
    } catch (e) { /* ignore */ }
    try {
      const cfg = localStorage.getItem('gashConfig');
      if (cfg) {
        G.config = JSON.parse(cfg);
        if (G.config.theme && G.config.theme !== 'default') {
          document.body.className = 'theme-' + G.config.theme;
        }
      }
    } catch (e) { /* ignore */ }
    try {
      const hist = localStorage.getItem('gashHistory');
      if (hist) G.history = JSON.parse(hist);
    } catch (e) { /* ignore */ }
    G.historyIndex = G.history.length;
  };

  G._saveHistory = function () {
    try {
      if (G.history.length > 500) G.history = G.history.slice(-500);
      localStorage.setItem('gashHistory', JSON.stringify(G.history));
    } catch (e) { /* ignore */ }
  };

  // ─── VARIABLE EXPANSION ─────────────────────────────────────────

  G.expandVars = function (text) {
    if (!text || text.includes("'")) {
      let result = '';
      let i = 0;
      while (i < text.length) {
        if (text[i] === "'") {
          const end = text.indexOf("'", i + 1);
          if (end === -1) { result += text.slice(i); break; }
          result += text.slice(i + 1, end);
          i = end + 1;
        } else if (text[i] === '"') {
          const end = text.indexOf('"', i + 1);
          if (end === -1) { result += expandInner(text.slice(i + 1)); break; }
          result += expandInner(text.slice(i + 1, end));
          i = end + 1;
        } else if (text[i] === '$' && i + 1 < text.length) {
          if (text[i + 1] === '(') {
            const end = findMatchingParen(text, i + 1);
            if (end !== -1) {
              const subCmd = text.slice(i + 2, end);
              const subResult = G._execSubCommand(subCmd);
              result += subResult;
              i = end + 1;
            } else { result += text[i]; i++; }
          } else if (text[i + 1] === '{') {
            const end = text.indexOf('}', i + 2);
            if (end !== -1) {
              const varName = text.slice(i + 2, end);
              result += G.vars[varName] !== undefined ? G.vars[varName] : '';
              i = end + 1;
            } else { result += text[i]; i++; }
          } else {
            let end = i + 1;
            while (end < text.length && /\w/.test(text[end])) end++;
            const varName = text.slice(i + 1, end);
            result += G.vars[varName] !== undefined ? G.vars[varName] : '';
            i = end;
          }
        } else {
          result += text[i];
          i++;
        }
      }
      return result;
    }
    return expandInner(text);
  };

  function expandInner(text) {
    let result = '';
    let i = 0;
    while (i < text.length) {
      if (text[i] === '$' && i + 1 < text.length) {
        if (text[i + 1] === '(') {
          const end = findMatchingParen(text, i + 1);
          if (end !== -1) {
            const subCmd = text.slice(i + 2, end);
            const subResult = G._execSubCommand(subCmd);
            result += subResult;
            i = end + 1;
          } else { result += text[i]; i++; }
        } else if (text[i + 1] === '{') {
          const end = text.indexOf('}', i + 2);
          if (end !== -1) {
            const varName = text.slice(i + 2, end);
            result += G.vars[varName] !== undefined ? G.vars[varName] : '';
            i = end + 1;
          } else { result += text[i]; i++; }
        } else {
          let end = i + 1;
          while (end < text.length && /\w/.test(text[end])) end++;
          const varName = text.slice(i + 1, end);
          result += G.vars[varName] !== undefined ? G.vars[varName] : '';
          i = end;
        }
      } else {
        result += text[i];
        i++;
      }
    }
    return result;
  }

  function findMatchingParen(text, start) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') {
        if (depth === 0) return i;
        depth--;
      }
    }
    return -1;
  }

  G._execSubCommand = function (cmd) {
    try {
      let result = '';
      const oldAddToConsole = G.addToConsole;
      G.addToConsole = function (text) { result += text.replace(/^> ?/gm, '') + '\n'; };
      G.processCommandSync(cmd);
      G.addToConsole = oldAddToConsole;
      return result.trim();
    } catch (e) {
      return '';
    }
  };

  // ─── TOKENIZER ───────────────────────────────────────────────────

  function tokenize(input) {
    const tokens = [];
    let i = 0;
    let current = '';
    let inSingle = false;
    let inDouble = false;

    while (i < input.length) {
      const c = input[i];

      if (inSingle) {
        if (c === "'") { inSingle = false; }
        else { current += c; }
      } else if (inDouble) {
        if (c === '"') { inDouble = false; }
        else if (c === '\\') { current += input[i + 1] || ''; i++; }
        else { current += c; }
      } else if (c === "'") {
        inSingle = true;
      } else if (c === '"') {
        inDouble = true;
      } else if (c === '|' || c === '>' || c === ';' || c === '&') {
        if (current.trim()) {
          tokens.push({ type: 'text', value: current.trim() });
        }
        if (c === '|') {
          if (i + 1 < input.length && input[i + 1] === '|') {
            tokens.push({ type: 'or', value: '||' });
            i++;
          } else {
            tokens.push({ type: 'pipe', value: '|' });
          }
        } else if (c === '>') {
          if (i + 1 < input.length && input[i + 1] === '>') {
            tokens.push({ type: 'redirect', value: '>>' });
            i++;
          } else {
            tokens.push({ type: 'redirect', value: '>' });
          }
        } else if (c === ';') {
          tokens.push({ type: 'semicolon', value: ';' });
        } else if (c === '&') {
          if (i + 1 < input.length && input[i + 1] === '&') {
            tokens.push({ type: 'and', value: '&&' });
            i++;
          } else {
            tokens.push({ type: 'background', value: '&' });
          }
        }
        current = '';
      } else if (c === ' ' || c === '\t') {
        if (current.trim()) {
          tokens.push({ type: 'text', value: current.trim() });
        }
        current = '';
      } else {
        current += c;
      }
      i++;
    }

    if (current.trim()) {
      tokens.push({ type: 'text', value: current.trim() });
    }

    return tokens;
  }

  // ─── COMMAND PARSING (groups & connectors) ────────────────────

  function parsePipeline(input) {
    var expanded = G.expandVars(input);
    var tokens = tokenize(expanded);

    var groups = [];
    var connectors = [];
    var curPipe = [];
    var curSeg = { args: [], redirects: [] };

    function flushSeg() {
      if (curSeg.args.length || curSeg.redirects.length) {
        curPipe.push({ args: curSeg.args, redirects: curSeg.redirects });
        curSeg = { args: [], redirects: [] };
      }
    }

    function flushGroup() {
      flushSeg();
      if (curPipe.length) {
        groups.push(curPipe);
        curPipe = [];
      }
    }

    for (var ti = 0; ti < tokens.length; ti++) {
      var t = tokens[ti];
      if (t.type === 'text') {
        var redirs = curSeg.redirects;
        if (redirs.length && redirs[redirs.length - 1].target === null) {
          redirs[redirs.length - 1].target = t.value;
        } else {
          curSeg.args.push(t.value);
        }
      } else if (t.type === 'pipe') {
        flushSeg();
      } else if (t.type === 'redirect') {
        curSeg.redirects.push({ op: t.value, target: null });
      } else if (t.type === 'semicolon') {
        flushGroup();
        connectors.push(';');
      } else if (t.type === 'and') {
        flushGroup();
        connectors.push('&&');
      } else if (t.type === 'or') {
        flushGroup();
        connectors.push('||');
      } else if (t.type === 'background') {
        flushSeg();
        if (curPipe.length) {
          curPipe[curPipe.length - 1].background = true;
        }
        flushGroup();
        connectors.push('&');
      }
    }

    flushGroup();

    return { groups: groups, connectors: connectors };
  }

  // ─── COMMAND DISPATCH ───────────────────────────────────────────

  function makeCtx(pipeInput) {
    return {
      fs: G.fs, vars: G.vars, aliases: G.aliases, config: G.config,
      history: G.history, socket: G.socket, gashFunctions: G.gashFunctions,
      gashPackages: G.gashPackages, waitingForFunction: G.waitingForFunction,
      pipeInput: pipeInput, addToConsole: G.addToConsole,
      processCommand: G.processCommand,
      _saveFunctions: G._saveFunctions, _savePackages: G._savePackages,
      _saveAliases: G._saveAliases, _saveConfig: G._saveConfig,
      _clearConsole: G._clearConsole, _updatePrompt: G._updatePrompt
    };
  }

  async function execPipeline(pipeline, initialInput) {
    var pipeOutput = initialInput;
    for (var si = 0; si < pipeline.length; si++) {
      var seg = pipeline[si];
      var args = seg.args;
      var redirects = seg.redirects;
      if (!args.length) { pipeOutput = pipeOutput || ''; continue; }

      var cmdName = args[0].toLowerCase();
      if (G.aliases[cmdName]) {
        var aliasCmd = G.aliases[cmdName];
        cmdName = aliasCmd.split(/\s+/)[0].toLowerCase();
        args.splice(0, 1, ...aliasCmd.split(/\s+/).slice(1));
      }

      var cmdEntry = G.commands[cmdName];
      if (!cmdEntry) {
        pipeOutput = 'error: unknown command: ' + cmdName;
        continue;
      }

      var ctx = makeCtx(pipeOutput);
      var output;
      try {
        output = await cmdEntry.handler(args.slice(1), ctx);
        G.socket = ctx.socket;
        G.waitingForFunction = ctx.waitingForFunction;
      } catch (err) {
        output = 'error: ' + err.message;
      }

      pipeOutput = output !== null
        ? (typeof output === 'string' ? output.replace(/^> ?/gm, '').trim() : '')
        : null;

      for (var ri = 0; ri < redirects.length; ri++) {
        var redir = redirects[ri];
        if (redir.target && pipeOutput != null) {
          try {
            var p = G.fs.normalizePath(redir.target);
            if (redir.op === '>') await G.fs.writeFile(p, pipeOutput);
            else if (redir.op === '>>') {
              var exist = '';
              try { exist = await G.fs.readFile(p); } catch (e) {}
              await G.fs.writeFile(p, exist + pipeOutput);
            }
            pipeOutput = null;
          } catch (e) {
            G.addToConsole('> redirect error: ' + e.message, 'error-output');
          }
        }
      }
    }
    return pipeOutput;
  }

  G.processCommand = async function (input) {
    if (!input || !input.trim()) return;

    G.history.push(input);
    G.historyIndex = G.history.length;
    G._saveHistory();

    var parsed = parsePipeline(input);
    var groups = parsed.groups;
    var connectors = parsed.connectors;

    var lastError = false;

    for (var gi = 0; gi < groups.length; gi++) {
      var pipeline = groups[gi];

      // Check connector from previous group
      if (gi > 0) {
        var prevConn = connectors[gi - 1];
        if (prevConn === '&&' && lastError) continue;
        if (prevConn === '||' && !lastError) continue;
      }

      var isBg = pipeline.some(function (s) { return s.background; });
      var connector = gi < connectors.length ? connectors[gi] : null;

      if (isBg) {
        // Background: don't await, track as job
        var jobId = G.nextJobId++;
        var cmdText = pipeline.map(function (s) { return s.args.join(' '); }).join(' | ');
        var job = { id: jobId, command: cmdText, status: 'running', timestamp: Date.now() };
        G.jobs[jobId] = job;
        job.promise = execPipeline(pipeline, null).then(function (out) {
          job.status = 'done';
          if (out != null) G.addToConsole('[job ' + jobId + '] ' + out);
          return out;
        }).catch(function (err) {
          job.status = 'failed';
          G.addToConsole('[job ' + jobId + '] error: ' + err.message, 'error-output');
        });
        lastError = false;
        if (connector === '&') continue;
      } else {
        var result = await execPipeline(pipeline, null);
        lastError = result && result.startsWith('error:');

        // Show output only if this is the last group or it's standalone
        if (gi === groups.length - 1 && result != null) {
          var cls = lastError ? 'error-output' : '';
          G.addToConsole('> ' + result, cls);
        } else if (groups.length === 1 && result != null && connector !== '|') {
          var cls2 = lastError ? 'error-output' : '';
          G.addToConsole('> ' + result, cls2);
        }

        if (connector === '&') continue;
      }
    }
  };

  // Synchronous version for command substitution
  G.processCommandSync = function (input) {
    var parsed = parsePipeline(input);
    var groups = parsed.groups;
    var connectors = parsed.connectors;
    var pipeOutput = null;
    var lastError = false;

    for (var gi = 0; gi < groups.length; gi++) {
      var pipeline = groups[gi];
      if (gi > 0) {
        var prevConn = connectors[gi - 1];
        if (prevConn === '&&' && lastError) continue;
        if (prevConn === '||' && !lastError) continue;
      }
      if (pipeline.some(function (s) { return s.background; })) continue;

      for (var si = 0; si < pipeline.length; si++) {
        var seg = pipeline[si];
        var args = seg.args;
        if (!args.length) continue;

        var cmdName = args[0].toLowerCase();
        if (G.aliases[cmdName]) {
          cmdName = G.aliases[cmdName].split(/\s+/)[0].toLowerCase();
        }

        var cmdEntry = G.commands[cmdName];
        if (!cmdEntry) { pipeOutput = 'error: unknown command: ' + cmdName; lastError = true; continue; }

        var ctx = {
          fs: G.fs, vars: G.vars, aliases: G.aliases, config: G.config,
          history: G.history, socket: G.socket, gashFunctions: G.gashFunctions,
          pipeInput: pipeOutput, addToConsole: G.addToConsole,
          processCommand: G.processCommandSync
        };

        var result = cmdEntry.handler(args.slice(1), ctx);
        if (result && typeof result.then === 'function') {
          pipeOutput = '';
        } else if (result !== null) {
          pipeOutput = typeof result === 'string' ? result.replace(/^> ?/gm, '').trim() : '';
        } else { pipeOutput = null; }
        lastError = pipeOutput && pipeOutput.startsWith('error:');
      }
    }

    return pipeOutput || '';
  };

  // ─── TAB COMPLETION ─────────────────────────────────────────────

  function getTabCompletions(prefix) {
    if (!prefix) return [];

    const commands = Object.keys(G.commands);
    const matches = commands.filter(c => c.startsWith(prefix.toLowerCase()));

    if (matches.length === 0 && G.fs && G.fs.ready) {
      const normalized = G.fs.normalizePath(prefix);
      const parent = normalized.split('/').slice(0, -1).join('/') || '/';
      const partial = normalized.split('/').pop() || '';
      G.fs.readdir(parent).then(entries => {
        const fileMatches = entries
          .map(e => e.name)
          .filter(name => name.startsWith(partial));
        if (fileMatches.length > 0) {
          showTabSuggestions(fileMatches, prefix);
        }
      }).catch(() => {});
    }

    return matches;
  }

  let tabSuggestions = [];
  let tabIndex = 0;

  function showTabSuggestions(suggestions, originalPrefix) {
    if (!suggestions || suggestions.length === 0) return;
    tabSuggestions = suggestions;
    tabIndex = 0;

    if (suggestions.length === 1) {
      completeWith(suggestions[0], originalPrefix);
      tabSuggestions = [];
    } else {
      G.addToConsole('> ' + suggestions.join('  '), 'help-output');
    }
  }

  function completeWith(completion, originalPrefix) {
    const words = inputField.value.split(' ');
    words[words.length - 1] = completion + ' ';
    inputField.value = words.join(' ');
    const len = inputField.value.length;
    inputField.setSelectionRange(len, len);
    tabSuggestions = [];
  }

  // ─── INPUT FIELD EVENT HANDLING ─────────────────────────────────

  if (!inputField) {
    console.error('GASH: input field not found');
  } else {
    // Real-time input tracking (used by history search)
    inputField.addEventListener('input', function () {
      if (G.historySearchMode) {
        G.historySearchQuery = inputField.value;
        if (G.historySearchQuery) {
          G.filteredHistory = G.history.filter(cmd =>
            cmd.toLowerCase().includes(G.historySearchQuery.toLowerCase())
          );
        } else {
          G.filteredHistory = [];
        }
      }
    });

    inputField.addEventListener('keydown', async function (event) {
      const key = event.key;

      // Editor mode: only intercept Enter
      if (G.editorMode) {
        if (key === 'Enter') {
          event.preventDefault();
          const val = inputField.value;
          inputField.value = '';
          const result = G.editor.processCommand(val);
          if (result) {
            if (result.saveAndContinue) {
              await G.editor.save(G.fs);
              G.addToConsole(`> saved ${G.editor.filename}`);
              G._updatePrompt();
            } else if (result.saveAndQuit) {
              await G.editor.save(G.fs);
              G.addToConsole(`> saved and closed ${G.editor.filename}`);
              G.editor.active = false;
              G.editorMode = false;
              G._updatePrompt();
            } else if (!result.stayOpen) {
              G.editor.active = false;
              G.editorMode = false;
              G._updatePrompt();
            }
            if (result.output) {
              G.addToConsole(result.output);
            }
          }
        }
        return;
      }

      // Package input hook (e.g., Python REPL)
      if (G.inputHook) {
        if (key === 'Enter') {
          event.preventDefault();
          const val = inputField.value.trim();
          inputField.value = '';
          tabSuggestions = [];
          if (val) G.inputHook(val);
        }
        if (key === 'Escape') {
          event.preventDefault();
          inputField.value = '';
          G.addToConsole('> Type exit() to quit current mode');
        }
        return;
      }

      // History search mode
      if (G.historySearchMode) {
        if (key === 'Enter') {
          event.preventDefault();
          G.historySearchMode = false;
          const cmd = G.filteredHistory.length > 0 ? G.filteredHistory[0] : inputField.value;
          inputField.value = '';
          G._updatePrompt();
          if (cmd.trim()) {
            G.addToConsole(cmd.trim());
            G.processCommand(cmd.trim());
          }
          return;
        }
        if (key === 'Escape') {
          G.historySearchMode = false;
          G.historySearchQuery = '';
          inputField.value = '';
          G._updatePrompt();
          return;
        }
        return;
      }

      // Normal mode

      if (key === 'Enter') {
        event.preventDefault();
        const val = inputField.value.trim();
        inputField.value = '';
        tabSuggestions = [];

        if (G.waitingForFunction) {
          if (typeof G.waitingForFunction === 'object' && G.waitingForFunction.type === 'wipe') {
            if (val === G.waitingForFunction.code) {
              localStorage.clear();
              G.addToConsole('> Local storage wiped!');
            } else if (val === 'no') {
              G.addToConsole('> Wipe cancelled.');
            } else {
              G.addToConsole('> Invalid confirmation. Wipe cancelled.');
            }
            G.waitingForFunction = null;
          } else if (val === 'endfunc') {
            G.addToConsole(`> Function "${G.waitingForFunction}" saved.`);
            G._saveFunctions();
            G.waitingForFunction = null;
          } else {
            G.gashFunctions[G.waitingForFunction].push(val);
          }
          G._updatePrompt();
          return;
        }

        if (val) {
          G.addToConsole(val);
          G.processCommand(val);
        }
        return;
      }

      if (key === 'Tab') {
        event.preventDefault();
        const words = inputField.value.split(' ');
        const prefix = words[words.length - 1];
        const matches = getTabCompletions(prefix);

        if (matches.length === 1) {
          words[words.length - 1] = matches[0] + ' ';
          inputField.value = words.join(' ');
          const len = inputField.value.length;
          inputField.setSelectionRange(len, len);
        } else if (matches.length > 1) {
          tabSuggestions = matches;
          tabIndex = (tabIndex + 1) % matches.length;
          G.addToConsole('> ' + matches.join('  '), 'help-output');
        }
        return;
      }

      if (key === 'ArrowUp') {
        event.preventDefault();
        if (G.history.length > 0) {
          if (G.historyIndex > 0) G.historyIndex--;
          inputField.value = G.history[G.historyIndex] || '';
          const len = inputField.value.length;
          inputField.setSelectionRange(len, len);
        }
        return;
      }

      if (key === 'ArrowDown') {
        event.preventDefault();
        if (G.historyIndex < G.history.length - 1) {
          G.historyIndex++;
          inputField.value = G.history[G.historyIndex] || '';
        } else {
          G.historyIndex = G.history.length;
          inputField.value = '';
        }
        const len = inputField.value.length;
        inputField.setSelectionRange(len, len);
        return;
      }

      if ((key === 'r' || key === 'R') && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        G.historySearchMode = true;
        G.historySearchQuery = '';
        G.filteredHistory = [];
        inputField.value = '';
        G.addToConsole('> (history search) type to search...');
        G._updatePrompt();
        return;
      }
    });

    // Keep input focused
    document.addEventListener('click', function () {
      inputField.focus();
    });

    inputField.focus();
  }

  // ─── EDITOR COMMAND ─────────────────────────────────────────────

  G.register('edit', async function (args, ctx) {
    if (!args.length) return '> error: usage: edit <path>';
    const mode = args[0] === '-c' ? (args.shift(), 'command') : 'visual';
    const filename = ctx.fs.normalizePath(args[0]);
    if (!G.editor) G.editor = new G.Editor();
    const output = await G.editor.open(filename, ctx.fs, mode);
    G.editorMode = true;
    G._updatePrompt();
    return output;
  }, 'Edit files with the built-in line editor\n  edit <path>      Visual editor (default)\n  edit -c <path>    Command-based editor', 'edit');

  // ─── INITIALIZATION ─────────────────────────────────────────────

  G.init = async function () {
    G._loadState();

    G.fs = new G.VirtualFileSystem();
    try {
      await G.fs.init();
      G.vars.PWD = G.fs.cwd;
    } catch (err) {
      console.error('VFS init error:', err);
    }

    // ─── gVFS setup: prompt for user & build Linux layout ──────────
    var needsSetup = false;
    try { needsSetup = !(await G.fs.exists('/etc/passwd')); }
    catch (e) { needsSetup = true; }

    if (needsSetup) {
      var username = prompt('Enter username:', 'gashuser') || 'gashuser';
      var rootPass = prompt('Set root password:', 'root') || 'root';
      await G.fs.populateDefaultStructure(username, rootPass);
      localStorage.setItem('gashUser', username);
      localStorage.setItem('gashRootHash', btoa(rootPass));
      G.vars.USER = username;
      G.vars.HOME = '/home/' + username;
      G.fs.cwd = '/home/' + username;
      G.vars.PWD = '/home/' + username;
      G.hostname = 'gashbox';
    } else {
      var savedUser = localStorage.getItem('gashUser') || 'gashuser';
      G.vars.USER = savedUser;
      G.vars.HOME = '/home/' + savedUser;
      G.hostname = 'gashbox';
    }

    // ─── Load packages from /sys/bin/ ─────────────────────────────
    try {
      var sysEntries = await G.fs.readdir('/sys/bin');
      for (var si = 0; si < sysEntries.length; si++) {
        var e = sysEntries[si];
        if (e.type === 'file' && e.name.endsWith('.js')) {
          var pkgName = e.name.slice(0, -3);
          if (!G.gashPackages[pkgName]) {
            var code = await G.fs.readFile('/sys/bin/' + e.name);
            G.gashPackages[pkgName] = { code: code, url: '/sys/bin/' + e.name, installed: Date.now() };
          }
        }
      }
    } catch (e) { /* /sys/bin not ready yet */ }

    // ─── Re-execute all package code to register commands ─────────
    var pkgCount = 0;
    for (var pn in G.gashPackages) {
      try {
        (new Function('GASH', 'ctx', 'args', 'console', 'document', 'window', G.gashPackages[pn].code))(window.GASH, {}, [], console, document, window);
        pkgCount++;
      } catch (e) {
        console.error('Package re-execution failed:', pn, e);
      }
    }

    G._clearConsole();
    G._updatePrompt();

    G.addToConsole('> \ud83d\udfe2 GASH v' + G.version + ' loaded. Virtual filesystem ready.');
    if (pkgCount > 0) G.addToConsole('> \ud83d\udce6 ' + pkgCount + ' package(s) loaded.');
    G.addToConsole('> Type "help" to get started.');
  };

  // ─── CRON SCHEDULER ──────────────────────────────────────────────

  G._cronTimers = {};

  G._startCron = function () {
    if (G._cronInterval) return;
    G._cronInterval = setInterval(async function () {
      if (!G.fs || !G.fs.ready) return;
      try {
        var entries = await G.fs.readdir('/var/spool/cron');
        for (var ci = 0; ci < entries.length; ci++) {
          var e = entries[ci];
          if (e.type !== 'file') continue;
          var content = await G.fs.readFile('/var/spool/cron/' + e.name);
          var parts = content.split(' ');
          var interval = parseInt(parts[0]);
          if (isNaN(interval) || interval < 1) continue;
          var cmd = parts.slice(1).join(' ');
          var lastRun = G._cronTimers[e.name] || 0;
          var now = Date.now();
          if (now - lastRun >= interval * 1000) {
            G._cronTimers[e.name] = now;
            G.processCommand(cmd);
          }
        }
      } catch (e) { /* /var/spool/cron may not exist */ }
    }, 5000);
  };

  // ─── START ──────────────────────────────────────────────────────

  G.init().then(function () {
    G._startCron();
  }).catch(err => {
    console.error('GASH init error:', err);
  });
})();
