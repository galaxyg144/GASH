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
  G.currentInput = '';
  G.socket = null;
  G.waitingForFunction = null;
  G.gashFunctions = {};
  G.gashPackages = {};
  G.editorMode = false;
  G.filteredHistory = [];
  G.historySearchMode = false;
  G.historySearchQuery = '';

  // ─── DOM REFS ───────────────────────────────────────────────────

  const inputText = document.getElementById('input-text');
  const consoleOutput = document.getElementById('console-output');
  const promptLabel = document.getElementById('prompt-label');
  const blinkingCaret = document.getElementById('blinking-caret');

  // ─── HELPERS ────────────────────────────────────────────────────

  G.addToConsole = function (text, cls) {
    if (text == null || text === '') return;
    const clsAttr = cls ? ` class="${cls}"` : '';
    consoleOutput.innerHTML += `<div${clsAttr}><span class="prompt-gash">GASH $ </span>${text}</div>`;
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  };

  G._clearConsole = function () {
    const welcome = `Welcome to GASH - Galaxy's Developer Shell v${G.version}\nType your commands below...\nType 'help' for available commands.`;
    consoleOutput.innerHTML = `<div><span class="prompt-gash">GASH $ </span>${welcome.replace(/\n/g, '<br>')}</div>`;
  };

  G._updatePrompt = function () {
    if (promptLabel) {
      let label = G.config.prompt || 'GASH';
      if (G.editorMode) {
        promptLabel.textContent = `EDIT:${G.editor.filename}> `;
      } else if (G.waitingForFunction) {
        promptLabel.textContent = `func> `;
      } else {
        promptLabel.textContent = `${label} $ `;
      }
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
      } else if (c === '|' || c === '>') {
        if (current.trim()) {
          tokens.push({ type: 'text', value: current.trim() });
        }
        if (c === '|') tokens.push({ type: 'pipe', value: '|' });
        else if (c === '>') {
          if (i + 1 < input.length && input[i + 1] === '>') {
            tokens.push({ type: 'redirect', value: '>>' });
            i++;
          } else {
            tokens.push({ type: 'redirect', value: '>' });
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

  // ─── COMMAND PARSING ────────────────────────────────────────────

  function parsePipeline(input) {
    const expanded = G.expandVars(input);
    const tokens = tokenize(expanded);

    const segments = [{ cmdTokens: [], redirects: [] }];
    let currentSeg = segments[0];

    for (const token of tokens) {
      if (token.type === 'pipe') {
        currentSeg = { cmdTokens: [], redirects: [] };
        segments.push(currentSeg);
      } else if (token.type === 'redirect') {
        currentSeg.redirects.push({ op: token.value, target: null });
      } else if (token.type === 'text') {
        const redirects = currentSeg.redirects;
        if (redirects.length > 0 && redirects[redirects.length - 1].target === null) {
          redirects[redirects.length - 1].target = token.value;
        } else {
          currentSeg.cmdTokens.push(token.value);
        }
      }
    }

    return segments.map(seg => ({
      args: seg.cmdTokens,
      redirects: seg.redirects
    }));
  }

  // ─── COMMAND DISPATCH ───────────────────────────────────────────

  G.processCommand = async function (input) {
    if (!input || !input.trim()) return;

    G.history.push(input);
    G.historyIndex = G.history.length;
    G._saveHistory();

    const pipeSegments = parsePipeline(input);

    let pipeOutput = null;

    for (let si = 0; si < pipeSegments.length; si++) {
      const seg = pipeSegments[si];
      const args = seg.args;
      const redirects = seg.redirects;

      if (!args.length) {
        pipeOutput = pipeOutput || '';
        continue;
      }

      let cmdName = args[0].toLowerCase();

      if (G.aliases[cmdName]) {
        const aliasCmd = G.aliases[cmdName];
        const aliasParts = aliasCmd.split(/\s+/);
        cmdName = aliasParts[0].toLowerCase();
        args.splice(0, 1, ...aliasParts.slice(1));
      }

      const cmdEntry = G.commands[cmdName];

      if (!cmdEntry) {
        pipeOutput = `error: unknown command: ${cmdName}`;
        if (pipeSegments.length === 1) {
          G.addToConsole(`> ${pipeOutput}`, 'error-output');
        }
        return;
      }

      const cmdArgs = args.slice(1);

      const ctx = {
        fs: G.fs,
        vars: G.vars,
        aliases: G.aliases,
        config: G.config,
        history: G.history,
        socket: G.socket,
        gashFunctions: G.gashFunctions,
        gashPackages: G.gashPackages,
        waitingForFunction: G.waitingForFunction,
        pipeInput: pipeOutput,
        addToConsole: G.addToConsole,
        processCommand: G.processCommand,
        _saveFunctions: G._saveFunctions,
        _savePackages: G._savePackages,
        _saveAliases: G._saveAliases,
        _saveConfig: G._saveConfig,
        _clearConsole: G._clearConsole,
        _updatePrompt: G._updatePrompt
      };

      let output;
      try {
        output = await cmdEntry.handler(cmdArgs, ctx);
        G.socket = ctx.socket;
        G.waitingForFunction = ctx.waitingForFunction;
      } catch (err) {
        output = `error: ${err.message}`;
      }

      if (output !== null) {
        pipeOutput = typeof output === 'string' ? output.replace(/^> ?/gm, '').trim() : '';
      } else {
        pipeOutput = null;
      }

      // Handle redirects
      for (const redir of redirects) {
        if (redir.target && pipeOutput != null) {
          try {
            const path = G.fs.normalizePath(redir.target);
            if (redir.op === '>') {
              await G.fs.writeFile(path, pipeOutput);
            } else if (redir.op === '>>') {
              let existing = '';
              try { existing = await G.fs.readFile(path); }
              catch (e) { /* file doesn't exist */ }
              await G.fs.writeFile(path, existing + pipeOutput);
            }
            pipeOutput = null;
          } catch (e) {
            G.addToConsole(`> redirect error: ${e.message}`, 'error-output');
          }
        }
      }

      // Display output if last in pipeline and no redirect consumed it
      if (si === pipeSegments.length - 1 && pipeOutput != null) {
        G.addToConsole(`> ${pipeOutput}`);
      }
    }
  };

  // Synchronous version for command substitution
  G.processCommandSync = function (input) {
    const segments = parsePipeline(input);
    let pipeOutput = null;

    for (const seg of segments) {
      const args = seg.args;
      if (!args.length) continue;

      let cmdName = args[0].toLowerCase();
      if (G.aliases[cmdName]) {
        const aliasCmd = G.aliases[cmdName];
        cmdName = aliasCmd.split(/\s+/)[0].toLowerCase();
      }

      const cmdEntry = G.commands[cmdName];
      if (!cmdEntry) {
        pipeOutput = `error: unknown command: ${cmdName}`;
        continue;
      }

      const cmdArgs = args.slice(1);
      const ctx = {
        fs: G.fs, vars: G.vars, aliases: G.aliases, config: G.config,
        history: G.history, socket: G.socket, gashFunctions: G.gashFunctions,
        pipeInput: pipeOutput, addToConsole: G.addToConsole,
        processCommand: G.processCommandSync
      };

      const result = cmdEntry.handler(cmdArgs, ctx);
      if (result && typeof result.then === 'function') {
        pipeOutput = '';
      } else if (result !== null) {
        pipeOutput = typeof result === 'string' ? result.replace(/^> ?/gm, '').trim() : '';
      } else {
        pipeOutput = null;
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
    const words = G.currentInput.split(' ');
    words[words.length - 1] = completion + ' ';
    G.currentInput = words.join(' ');
    inputText.textContent = G.currentInput;
    tabSuggestions = [];
  }

  // ─── KEYBOARD HANDLING ──────────────────────────────────────────

  document.addEventListener('keydown', async function (event) {
    const key = event.key;

    // Editor mode
    if (G.editorMode) {
      if (key === 'Enter') {
        event.preventDefault();
        const result = G.editor.processCommand(G.currentInput);
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
        G.currentInput = '';
        inputText.textContent = '';
      } else if (key === 'Backspace') {
        G.currentInput = G.currentInput.slice(0, -1);
        inputText.textContent = G.currentInput;
      } else if (key.length === 1) {
        G.currentInput += key;
        inputText.textContent = G.currentInput;
      }
      return;
    }

    // History search mode (Ctrl+R)
    if (G.historySearchMode) {
      if (key === 'Enter') {
        event.preventDefault();
        G.historySearchMode = false;
        if (G.filteredHistory.length > 0) {
          const cmd = G.filteredHistory[0];
          G.currentInput = cmd;
          inputText.textContent = cmd;
        }
        G._updatePrompt();
        return;
      }
      if (key === 'Backspace') {
        G.historySearchQuery = G.historySearchQuery.slice(0, -1);
      } else if (key.length === 1) {
        G.historySearchQuery += key;
      } else if (key === 'Escape') {
        G.historySearchMode = false;
        G.historySearchQuery = '';
        G._updatePrompt();
        return;
      }
      if (G.historySearchQuery) {
        G.filteredHistory = G.history.filter(cmd =>
          cmd.toLowerCase().includes(G.historySearchQuery.toLowerCase())
        );
      } else {
        G.filteredHistory = [];
      }
      if (G.filteredHistory.length > 0) {
        G.currentInput = G.filteredHistory[0];
        inputText.textContent = G.currentInput;
      } else {
        inputText.textContent = '';
      }
      return;
    }

    // Normal mode
    if (key === 'Backspace') {
      G.currentInput = G.currentInput.slice(0, -1);
    } else if (key === 'Enter') {
      event.preventDefault();
      const input = G.currentInput.trim();
      G.currentInput = '';
      inputText.textContent = '';
      tabSuggestions = [];

      if (G.waitingForFunction) {
        if (typeof G.waitingForFunction === 'object' && G.waitingForFunction.type === 'wipe') {
          if (input === G.waitingForFunction.code) {
            localStorage.clear();
            G.addToConsole('> Local storage wiped!');
          } else if (input === 'no') {
            G.addToConsole('> Wipe cancelled.');
          } else {
            G.addToConsole('> Invalid confirmation. Wipe cancelled.');
          }
          G.waitingForFunction = null;
        } else if (input === 'endfunc') {
          G.addToConsole(`> Function "${G.waitingForFunction}" saved.`);
          G._saveFunctions();
          G.waitingForFunction = null;
        } else {
          G.gashFunctions[G.waitingForFunction].push(input.trim());
        }
        G._updatePrompt();
        return;
      }

      if (input) {
        G.addToConsole(input);
        await G.processCommand(input);
      }
      return;
    } else if (key === 'Tab') {
      event.preventDefault();
      const words = G.currentInput.split(' ');
      const prefix = words[words.length - 1];
      const matches = getTabCompletions(prefix);

      if (matches.length === 1) {
        words[words.length - 1] = matches[0] + ' ';
        G.currentInput = words.join(' ');
      } else if (matches.length > 1) {
        tabSuggestions = matches;
        tabIndex = (tabIndex + 1) % matches.length;
        G.addToConsole('> ' + matches.join('  '), 'help-output');
      }
    } else if (key === 'ArrowUp') {
      event.preventDefault();
      if (G.history.length > 0) {
        if (G.historyIndex > 0) G.historyIndex--;
        G.currentInput = G.history[G.historyIndex] || '';
      }
    } else if (key === 'ArrowDown') {
      event.preventDefault();
      if (G.historyIndex < G.history.length - 1) {
        G.historyIndex++;
        G.currentInput = G.history[G.historyIndex] || '';
      } else {
        G.historyIndex = G.history.length;
        G.currentInput = '';
      }
    } else if (key === 'r' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      G.historySearchMode = true;
      G.historySearchQuery = '';
      G.filteredHistory = [];
      G.addToConsole('> (history search) type to search...');
      G._updatePrompt();
      return;
    } else if (key.length === 1 || key === ' ') {
      G.currentInput += key;
    }

    inputText.textContent = G.currentInput;
  });

  // ─── EDITOR COMMAND ─────────────────────────────────────────────

  G.register('edit', async function (args, ctx) {
    if (!args.length) return '> error: usage: edit <path>';
    const filename = ctx.fs.normalizePath(args[0]);

    if (!G.editor) G.editor = new G.Editor();
    const output = await G.editor.open(filename, ctx.fs);
    G.editorMode = true;
    G._updatePrompt();
    return output;
  }, 'Edit files with the built-in line editor', 'edit');

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

    G._clearConsole();
    G._updatePrompt();

    G.addToConsole('> \ud83d\udfe2 GASH v' + G.version + ' loaded. Virtual filesystem ready.');
    G.addToConsole('> Type "help" to get started.');
  };

  // ─── START ──────────────────────────────────────────────────────

  G.init().catch(err => {
    console.error('GASH init error:', err);
  });
})();
