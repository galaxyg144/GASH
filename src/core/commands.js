(function () {
  'use strict';

  window.GASH = window.GASH || {};
  const G = window.GASH;

  G.commands = {};
  G.commandCategories = {};

  G.register = function (name, handler, help, category) {
    const names = Array.isArray(name) ? name : [name];
    const cat = category || 'util';
    for (const n of names) {
      G.commands[n] = { handler, help: help || '', category: cat };
    }
    if (!G.commandCategories[cat]) G.commandCategories[cat] = [];
    for (const n of names) {
      if (!G.commandCategories[cat].includes(n)) G.commandCategories[cat].push(n);
    }
  };

  const HELP_FS = `File System Commands:
  ls [path]        - List directory contents
  cd <path>        - Change directory
  pwd              - Print working directory
  mkdir <path>     - Create directory
  touch <path>     - Create empty file
  cat <path>       - Display file contents
  rm [-r] <path>   - Remove file (-r for recursive)
  rmdir <path>     - Remove empty directory
  mv <src> <dest>  - Move/rename file
  cp <src> <dest>  - Copy file
  write <path> <content> - Write text to file
  find <path> <pat> - Find files matching pattern
  tree [path]      - Show directory tree`;

  const HELP_TEXT = `Text Processing Commands (supports piping):
  head [-n N] [path] - Show first N lines (default 10)
  tail [-n N] [path] - Show last N lines (default 10)
  wc [path]          - Word/line/char count
  sort               - Sort lines (piped input)
  uniq               - Unique lines (piped input)
  grep <pattern> [path] - Search for pattern`;

  const HELP_NET = `Networking Commands:
  int get <url>                   - HTTP GET request
  int post <url> <data>           - HTTP POST request
  int put <url> <data>            - HTTP PUT request
  int delete <url>                - HTTP DELETE request
  int headers <key>: <value>      - Set request header
  int headers clear               - Clear all headers
  int ws connect <url>            - Connect to WebSocket
  int ws send <message>           - Send WebSocket message
  int ws disconnect               - Close WebSocket`;

  const HELP_SCRIPT = `Scripting & Variables:
  set <name>=<value>   - Set shell variable
  export <name>=<value> - Set environment variable
  env                  - List all variables
  unset <name>         - Unset variable
  source <file>        - Execute commands from file
  Use $VAR or \${VAR} in commands for variable expansion
  Use $(command) for command substitution`;

  const HELP_ENV = `Environment Commands:
  alias <name>=<cmd>   - Create command alias
  unalias <name>       - Remove alias
  aliases              - List all aliases
  theme <name>         - Change theme (default, light, blue, red, purple, green)
  prompt <text>        - Set prompt label`;

  const HELP_PKG = `Function & Package Commands:
  func create <name>        - Create a GASH function
  func list                 - List functions
  func delete <name>        - Delete a function
  func run <name>           - Run a function
  func show <name>          - Show function code
  func export <name>        - Export function as JSON

  pkg install <name>        - Install from registry
  pkg install <name> <url>  - Install from URL
  pkg install -u <url>      - Install from URL (name from file)
  pkg run <name> [args]     - Execute a package
  pkg list                  - List installed packages
  pkg remove <name>         - Remove a package
  pkg create <name>         - Scaffold a new package from template
  pkg show <name>           - Show package source code
  pkg search <query>        - Search registry
  pkg info <name>           - Show package details from registry
  Flags for install:
    -a/--author <author>    - Filter by author
    -u/--url <url>          - Install from URL instead of registry`;

  const HELP_EDIT = `Editor Commands:
  edit <path> - Open file in line editor
    Editor commands (type at prompt):
    :i <line> <text>   - Insert text at line
    :a <text>          - Append text to end
    :d <line>          - Delete line
    :r <line> <text>   - Replace line
    :w                 - Save file
    :q                 - Quit without saving
    :wq                - Save and quit
    :p                 - Print file with line numbers
    :n                 - Show line count
    :c                 - Clear all lines
    :h                 - Show editor help`;

  const HELP_UTIL = `Utility Commands:
  echo <text>         - Print text (supports $VAR expansion)
  calc <op> <nums>    - Calculator (add, sub, mul, div, pow, sqrt, sin, cos)
  flip                - Flip a coin
  time                - Show current time
  date                - Show current date
  clear               - Clear console
  help [cmd/cat]      - Show help
  man <cmd>           - Show detailed command help
  about               - About GASH
  history             - Command history
  updlog              - Update log
  exit                - Close GASH
  sleep <ms>          - Delay for milliseconds
  seq <count>         - Print sequence of numbers
  which <cmd>         - Locate a command
  type <cmd>          - Show command type
  app run <name>      - Run an app from src/apps/
  localstr <op>       - Local storage operations
  figlet <text>       - Generate ASCII art banner
  weather [city]      - Show weather forecast
  top                 - Show system information

Job Control:
  cmd &               - Run command in background
  jobs                - List background jobs
  ps                  - Alias for jobs
  fg <jobid>          - Bring job to foreground
  bg <jobid>          - Resume job in background
  kill <jobid>        - Terminate a job

System Commands:
  sudo <cmd>          - Run command as root (prompts for password)
  whoami              - Show current username
  id                  - Show user identity
  hostname [name]     - Show or set hostname
  passwd              - Change account password
  cron list|add|rm    - Scheduler (tasks stored in /var/spool/cron/)
  serve [port]        - Start HTTP file server (via Service Worker)
  pkg create <name>   - Scaffold a new package from template`;

  // ─── FILE SYSTEM COMMANDS ────────────────────────────────────────

  G.register('ls', async function (args, ctx) {
    const path = args[0] || '.';
    try {
      const entries = await ctx.fs.readdir(path);
      if (!entries.length) return '>';
      let output = '';
      for (const e of entries) {
        const icon = e.type === 'directory' ? '\ud83d\udcc1' : '\ud83d\udcc4';
        const size = e.type === 'file' ? ` (${e.size}B)` : '';
        output += `> ${icon} ${e.name}${size}\n`;
      }
      return output.trimEnd();
    } catch (err) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  G.register('cd', async function (args, ctx) {
    const path = args[0] || '/';
    try {
      const normalized = ctx.fs.normalizePath(path);
      const exists = await ctx.fs.exists(normalized);
      if (!exists) return `> error: directory not found: ${normalized}`;
      const isDir = await ctx.fs.isDirectory(normalized);
      if (!isDir) return `> error: not a directory: ${normalized}`;
      ctx.fs.cwd = normalized;
      ctx.vars.PWD = normalized;
      return null;
    } catch (err) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  G.register('pwd', async function (args, ctx) {
    return `> ${ctx.fs.cwd}`;
  }, HELP_FS, 'fs');

  G.register('mkdir', async function (args, ctx) {
    if (!args.length) return '> error: usage: mkdir <path>';
    const path = args[0];
    const recursive = args[0] === '-p' ? (args.shift(), true) : false;
    try {
      if (recursive) {
        await ctx.fs.mkdirp(path);
      } else {
        await ctx.fs.mkdir(path);
      }
      return `> created directory: ${ctx.fs.normalizePath(path)}`;
    } catch (err) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  G.register('touch', async function (args, ctx) {
    if (!args.length) return '> error: usage: touch <path>';
    try {
      const normalized = ctx.fs.normalizePath(args[0]);
      if (await ctx.fs.exists(normalized)) {
        return `> ${normalized} already exists`;
      }
      await ctx.fs.writeFile(args[0], '');
      return `> created: ${normalized}`;
    } catch (err) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  G.register('cat', async function (args, ctx) {
    if (!args.length) {
      if (ctx.pipeInput != null) return `> ${ctx.pipeInput}`;
      return '> error: usage: cat <path>';
    }
    try {
      const content = await ctx.fs.readFile(args[0]);
      if (!content) return '> (empty)';
      return '> ' + content.split('\n').join('\n> ');
    } catch (err) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  G.register('rm', async function (args, ctx) {
    if (!args.length) return '> error: usage: rm [-r] <path>';
    const recursive = args[0] === '-r';
    if (recursive) args.shift();
    if (!args.length) return '> error: usage: rm [-r] <path>';
    try {
      if (recursive) {
        await ctx.fs.rmrf(args[0]);
      } else {
        await ctx.fs.delete(args[0]);
      }
      return `> removed: ${ctx.fs.normalizePath(args[0])}`;
    } catch (err) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  G.register('rmdir', async function (args, ctx) {
    if (!args.length) return '> error: usage: rmdir <path>';
    try {
      await ctx.fs.delete(args[0]);
      return `> removed directory: ${ctx.fs.normalizePath(args[0])}`;
    } catch (err) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  G.register('mv', async function (args, ctx) {
    if (args.length < 2) return '> error: usage: mv <src> <dest>';
    try {
      await ctx.fs.rename(args[0], args[1]);
      return `> renamed: ${args[0]} -> ${args[1]}`;
    } catch (err) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  G.register('cp', async function (args, ctx) {
    if (args.length < 2) return '> error: usage: cp <src> <dest>';
    try {
      await ctx.fs.copy(args[0], args[1]);
      return `> copied: ${args[0]} -> ${args[1]}`;
    } catch (err) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  G.register('write', async function (args, ctx) {
    if (args.length < 2) return '> error: usage: write <path> <content>';
    const path = args[0];
    const content = args.slice(1).join(' ');
    try {
      await ctx.fs.writeFile(path, content);
      return `> wrote ${content.length} bytes to ${ctx.fs.normalizePath(path)}`;
    } catch (err) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  G.register('find', async function (args, ctx) {
    if (args.length < 2) return '> error: usage: find <path> <pattern>';
    try {
      const results = await ctx.fs.find(args[0], args[1]);
      if (!results.length) return '> no matches found';
      return '> ' + results.join('\n> ');
    } catch (err) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  G.register('tree', async function (args, ctx) {
    const path = args[0] || '.';
    try {
      const normalized = ctx.fs.normalizePath(path);
      const name = normalized === '/' ? '/' : normalized.split('/').pop();
      let output = '> ' + name + '\n';
      output += await ctx.fs.tree(normalized);
      return output.trimEnd();
    } catch (err) {
      return `> error: ${err.message}`;
    }
  }, HELP_FS, 'fs');

  // ─── TEXT PROCESSING ─────────────────────────────────────────────

  G.register('head', async function (args, ctx) {
    let n = 10, input = ctx.pipeInput;
    if (args[0] === '-n' && args[1]) {
      n = parseInt(args[1]) || 10;
      args.splice(0, 2);
    }
    if (!input && args.length) {
      try { input = await ctx.fs.readFile(args[0]); }
      catch (err) { return `> error: ${err.message}`; }
    }
    if (input == null) return '> error: no input';
    const lines = input.split('\n').slice(0, n);
    return '> ' + lines.join('\n> ');
  }, HELP_TEXT, 'text');

  G.register('tail', async function (args, ctx) {
    let n = 10, input = ctx.pipeInput;
    if (args[0] === '-n' && args[1]) {
      n = parseInt(args[1]) || 10;
      args.splice(0, 2);
    }
    if (!input && args.length) {
      try { input = await ctx.fs.readFile(args[0]); }
      catch (err) { return `> error: ${err.message}`; }
    }
    if (input == null) return '> error: no input';
    const lines = input.split('\n');
    return '> ' + lines.slice(Math.max(0, lines.length - n)).join('\n> ');
  }, HELP_TEXT, 'text');

  G.register('wc', async function (args, ctx) {
    let input = ctx.pipeInput;
    if (!input && args.length) {
      try { input = await ctx.fs.readFile(args[0]); }
      catch (err) { return `> error: ${err.message}`; }
    }
    if (input == null) input = '';
    const lines = input.split('\n').length;
    const words = input.split(/\s+/).filter(Boolean).length;
    const chars = input.length;
    return `> ${lines} lines  ${words} words  ${chars} chars`;
  }, HELP_TEXT, 'text');

  G.register('sort', async function (args, ctx) {
    const input = ctx.pipeInput;
    if (input == null) return '> error: sort requires piped input';
    const lines = input.split('\n').sort();
    return '> ' + lines.join('\n> ');
  }, HELP_TEXT, 'text');

  G.register('uniq', async function (args, ctx) {
    const input = ctx.pipeInput;
    if (input == null) return '> error: uniq requires piped input';
    const lines = input.split('\n');
    const result = lines.filter((v, i, a) => i === 0 || v !== a[i - 1]);
    return '> ' + result.join('\n> ');
  }, HELP_TEXT, 'text');

  G.register('grep', async function (args, ctx) {
    if (!args.length) return '> error: usage: grep <pattern> [path]';
    const pattern = args[0];
    let input = ctx.pipeInput;
    if (!input && args.length > 1) {
      try { input = await ctx.fs.readFile(args[1]); }
      catch (err) { return `> error: ${err.message}`; }
    }
    if (input == null) return '> error: no input';
    let re;
    try { re = new RegExp(pattern, 'g'); }
    catch (err) { return `> error: invalid regex: ${err.message}`; }
    const lines = input.split('\n').filter(line => re.test(line));
    if (!lines.length) return '> no matches';
    return '> ' + lines.join('\n> ');
  }, HELP_TEXT, 'text');

  // ─── NETWORKING ─────────────────────────────────────────────────

  G.register('int', async function (args, ctx) {
    if (!args.length) return '> error: usage: int <get|post|put|delete|headers|ws>';

    const sub = args[0];

    if (sub === 'headers') {
      if (args[1] === 'clear') {
        ctx.vars._intHeaders = '{}';
        return '> headers cleared';
      }
      const headerStr = args.slice(1).join(' ');
      const idx = headerStr.indexOf(':');
      if (idx === -1) return '> error: usage: int headers <key>: <value>';
      const key = headerStr.slice(0, idx).trim();
      const val = headerStr.slice(idx + 1).trim();
      if (!key) return '> error: invalid header';
      let headers = {};
      try { headers = JSON.parse(ctx.vars._intHeaders || '{}'); } catch (e) { headers = {}; }
      headers[key] = val;
      ctx.vars._intHeaders = JSON.stringify(headers);
      return `> header set: ${key}: ${val}`;
    }

    if (sub === 'ws') {
      const action = args[1];
      if (action === 'connect') {
        const url = args[2];
        if (!url) return '> error: usage: int ws connect <ws://url>';
        try {
          ctx.socket = new WebSocket(url);
          ctx.socket.addEventListener('open', () => ctx.addToConsole(`> connected to WebSocket: ${url}`));
          ctx.socket.addEventListener('message', (e) => ctx.addToConsole(`> WS message: ${e.data}`));
          ctx.socket.addEventListener('close', () => { ctx.addToConsole('> WebSocket closed'); ctx.socket = null; });
          ctx.socket.addEventListener('error', () => ctx.addToConsole('> WebSocket error'));
          return `> connecting to ${url}...`;
        } catch (err) {
          return `> error: ${err.message}`;
        }
      } else if (action === 'send') {
        const msg = args.slice(2).join(' ');
        if (!ctx.socket || ctx.socket.readyState !== WebSocket.OPEN) {
          return '> error: no active WebSocket connection';
        }
        ctx.socket.send(msg);
        return `> sent: ${msg}`;
      } else if (action === 'disconnect') {
        if (!ctx.socket) return '> error: no active WebSocket';
        ctx.socket.close();
        ctx.socket = null;
        return '> disconnected';
      } else {
        return '> usage: int ws <connect|send|disconnect>';
      }
    }

    // HTTP methods
    const method = sub.toUpperCase();
    const url = args[1];
    if (!url) return `> error: usage: int ${sub} <url> [data]`;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return '> error: URL must start with http:// or https://';
    }

    const data = args.slice(2).join(' ');
    let headers = {};
    try { headers = JSON.parse(ctx.vars._intHeaders || '{}'); } catch (e) { headers = {}; }

    try {
      const fetchOpts = { method, headers };
      if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOpts.body = data;
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'text/plain';
          fetchOpts.headers = { ...headers };
        }
      }
      fetchOpts.headers = headers;

      const res = await fetch(url, fetchOpts);
      const text = await res.text();
      let preview = text.slice(0, 500);
      try {
        preview = JSON.stringify(JSON.parse(text), null, 2);
        if (preview.length > 500) preview = preview.slice(0, 500) + '\n... (truncated)';
      } catch (e) { /* not JSON, show raw */ }
      return `> ${method} ${url}\n> Status: ${res.status} ${res.statusText}\n> ${preview}`;
    } catch (err) {
      return `> error: ${err.message}`;
    }
  }, HELP_NET, 'net');

  // ─── SCRIPTING & VARIABLES ───────────────────────────────────────

  G.register('set', async function (args, ctx) {
    if (!args.length) return '> error: usage: set <name>=<value>';
    const arg = args.join(' ');
    const eqIdx = arg.indexOf('=');
    if (eqIdx === -1) return '> error: usage: set <name>=<value>';
    const name = arg.slice(0, eqIdx).trim();
    const val = arg.slice(eqIdx + 1).trim();
    if (!name) return '> error: invalid variable name';
    ctx.vars[name] = val;
    return `> ${name}=${val}`;
  }, HELP_SCRIPT, 'script');

  G.register('export', async function (args, ctx) {
    if (!args.length) return '> error: usage: export <name>=<value>';
    const arg = args.join(' ');
    const eqIdx = arg.indexOf('=');
    if (eqIdx === -1) return '> error: usage: export <name>=<value>';
    const name = arg.slice(0, eqIdx).trim();
    const val = arg.slice(eqIdx + 1).trim();
    if (!name) return '> error: invalid variable name';
    ctx.vars[name] = val;
    ctx.vars['exported_' + name] = '1';
    return `> ${name}=${val}`;
  }, HELP_SCRIPT, 'script');

  G.register('env', async function (args, ctx) {
    const keys = Object.keys(ctx.vars).filter(k => !k.startsWith('_') && !k.startsWith('exported_'));
    if (!keys.length) return '> (no variables)';
    return '> ' + keys.map(k => `${k}=${ctx.vars[k]}`).join('\n> ');
  }, HELP_SCRIPT, 'script');

  G.register('unset', async function (args, ctx) {
    if (!args.length) return '> error: usage: unset <name>';
    delete ctx.vars[args[0]];
    return `> unset ${args[0]}`;
  }, HELP_SCRIPT, 'script');

  G.register('source', async function (args, ctx) {
    if (!args.length) return '> error: usage: source <file>';
    try {
      const content = await ctx.fs.readFile(args[0]);
      const lines = content.split('\n').filter(l => l.trim());
      for (const line of lines) {
        ctx.addToConsole(`> \u00b7 ${line}`);
        await ctx.processCommand(line.trim());
      }
      return `> executed ${lines.length} commands from ${args[0]}`;
    } catch (err) {
      return `> error: ${err.message}`;
    }
  }, HELP_SCRIPT, 'script');

  // ─── ENVIRONMENT ─────────────────────────────────────────────────

  G.register('alias', async function (args, ctx) {
    if (!args.length) {
      const keys = Object.keys(ctx.aliases);
      if (!keys.length) return '> no aliases set';
      return '> ' + keys.map(k => `${k}=${ctx.aliases[k]}`).join('\n> ');
    }
    const arg = args.join(' ');
    const eqIdx = arg.indexOf('=');
    if (eqIdx === -1) {
      if (ctx.aliases[arg]) return `> ${arg}=${ctx.aliases[arg]}`;
      return `> alias not found: ${arg}`;
    }
    const name = arg.slice(0, eqIdx).trim();
    const val = arg.slice(eqIdx + 1).trim();
    if (!name) return '> error: invalid alias name';
    ctx.aliases[name] = val;
    ctx._saveAliases();
    return `> alias ${name}=${val}`;
  }, HELP_ENV, 'env');

  G.register('unalias', async function (args, ctx) {
    if (!args.length) return '> error: usage: unalias <name>';
    if (ctx.aliases[args[0]]) {
      delete ctx.aliases[args[0]];
      ctx._saveAliases();
      return `> removed alias: ${args[0]}`;
    }
    return `> alias not found: ${args[0]}`;
  }, HELP_ENV, 'env');

  G.register('aliases', async function (args, ctx) {
    const keys = Object.keys(ctx.aliases);
    if (!keys.length) return '> no aliases set';
    return '> ' + keys.map(k => `${k}=${ctx.aliases[k]}`).join('\n> ');
  }, HELP_ENV, 'env');

  G.register('theme', async function (args, ctx) {
    const themes = ['default', 'light', 'blue', 'red', 'purple', 'green'];
    if (!args.length) return `> usage: theme <name> (${themes.join(', ')})`;
    const t = args[0].toLowerCase();
    if (!themes.includes(t)) return `> unknown theme: ${t} (${themes.join(', ')})`;
    document.body.className = t === 'default' ? '' : 'theme-' + t;
    ctx.config.theme = t;
    ctx._saveConfig();
    return `> theme set to: ${t}`;
  }, HELP_ENV, 'env');

  G.register('prompt', async function (args, ctx) {
    if (!args.length) return `> current prompt: ${ctx.config.prompt}`;
    const text = args.join(' ');
    ctx.config.prompt = text;
    ctx._saveConfig();
    ctx._updatePrompt();
    return `> prompt set to: ${text}`;
  }, HELP_ENV, 'env');

  // ─── FUNCTIONS ────────────────────────────────────────────────────

  G.register('func', async function (args, ctx) {
    if (!args.length) return '> usage: func <create|delete|list|run|show|export> [name]';
    const sub = args[0];

    if (sub === 'create') {
      const name = args[1];
      if (!name) return '> error: usage: func create <name>';
      ctx.gashFunctions[name] = [];
      ctx.waitingForFunction = name;
      ctx.addToConsole(`> creating function "${name}"... type function code, end with "endfunc"`);
      return null;
    }

    if (sub === 'list') {
      const names = Object.keys(ctx.gashFunctions);
      if (!names.length) return '> no functions defined';
      return '> ' + names.join('\n> ');
    }

    if (sub === 'delete') {
      const name = args[1];
      if (!name) return '> error: usage: func delete <name>';
      if (ctx.gashFunctions[name]) {
        delete ctx.gashFunctions[name];
        ctx._saveFunctions();
        return `> function "${name}" deleted`;
      }
      return `> function "${name}" not found`;
    }

    if (sub === 'run') {
      const name = args[1];
      if (!name) return '> error: usage: func run <name>';
      const fn = ctx.gashFunctions[name];
      if (!fn) return `> function "${name}" not found`;
      ctx.addToConsole(`> running function "${name}"...`);
      for (const cmd of fn) {
        await ctx.processCommand(cmd);
      }
      return null;
    }

    if (sub === 'show') {
      const name = args[1];
      if (!name) return '> error: usage: func show <name>';
      const fn = ctx.gashFunctions[name];
      if (!fn) return `> function "${name}" not found`;
      return '> ' + fn.join('\n> ');
    }

    if (sub === 'export') {
      const name = args[1];
      if (!name) return '> error: usage: func export <name>';
      const fn = ctx.gashFunctions[name];
      if (!fn) return `> function "${name}" not found`;
      return '> ' + JSON.stringify({ name, commands: fn });
    }

    return '> usage: func <create|delete|list|run|show|export>';
  }, HELP_PKG, 'pkg');

  // ─── PACKAGE MANAGER (vanilla JS packages) ─────────────────────

  const REGISTRY_URL = 'https://raw.githubusercontent.com/galaxyg144/GASH/main/packages/registry.json';

  G.register('pkg', async function (args, ctx) {
    if (!args.length) return '> usage: pkg <install|run|list|remove|show|search|info>';
    const sub = args[0];

    const disclaimer = function () {
      ctx.addToConsole('> \u26a0 Galaxy is NOT responsible for any GASHware you install or run.', 'error-output');
      ctx.addToConsole('> Your browser sandboxes everything \u2014 you\'ll be fine, but don\'t be dumb.', 'error-output');
    };

    async function fetchRegistry() {
      const res = await fetch(REGISTRY_URL);
      if (!res.ok) throw new Error(`registry HTTP ${res.status}`);
      const data = await res.json();
      return data.packages || [];
    }

    function resolveUrl(url) {
      if (url.startsWith('/')) return window.location.origin + url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) return window.location.origin + '/' + url;
      return url;
    }

    async function fetchCode(url) {
      const resolved = resolveUrl(url);
      const res = await fetch(resolved);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        if (json.code) return json.code;
      } catch (e) { /* raw JS */ }
      return text;
    }

    async function installFromUrl(name, url, meta) {
      const resolved = resolveUrl(url);
      disclaimer();
      const code = await fetchCode(url);
      ctx.gashPackages[name] = { code, url: resolved, installed: Date.now(), ...meta };
      ctx._savePackages();
      // Persist to /sys/bin/ in VFS
      try {
        await ctx.fs.mkdirp('/sys/bin');
        await ctx.fs.writeFile('/sys/bin/' + name + '.js', code);
      } catch (e) { /* VFS not available */ }
      // Auto-execute package code so it registers commands immediately
      try {
        const fn = new Function('GASH', 'ctx', 'args', 'console', 'document', 'window', code);
        fn(window.GASH, ctx, [], ctx.console || console, document, window);
      } catch (e) {
        ctx.addToConsole(`> package execution warning: ${e.message}`, 'error-output');
      }
      if (meta && meta.description) {
        ctx.addToConsole(`> \ud83d\udce6 ${name} v${meta.version || '?'} by ${meta.author || '?'}`);
      }
      return `> installed package "${name}" (${code.length} chars)`;
    }

    // ── INSTALL ──────────────────────────────────────────────────

    if (sub === 'install') {
      const rest = args.slice(1);

      // Check for -u/--url flag
      const urlFlagIdx = rest.indexOf('-u') !== -1 ? rest.indexOf('-u') : rest.indexOf('--url');
      if (urlFlagIdx !== -1) {
        const url = rest[urlFlagIdx + 1];
        if (!url) return '> error: -u/--url requires a URL argument';
        const name = rest[0] !== '-u' && rest[0] !== '--url' ? rest[0] : url.split('/').pop().replace(/\.\w+$/, '');
        return await installFromUrl(name, url);
      }

      // Check for -a/--author flag
      const authorFlagIdx = rest.indexOf('-a') !== -1 ? rest.indexOf('-a') : rest.indexOf('--author');
      let authorFilter = null;
      let positionalArgs;
      if (authorFlagIdx !== -1) {
        authorFilter = rest[authorFlagIdx + 1];
        positionalArgs = rest.slice(0, authorFlagIdx);
      } else {
        positionalArgs = rest;
      }

      const name = positionalArgs[0];
      const url = positionalArgs[1];

      // Direct URL: pkg install <name> <url>
      if (name && url) {
        return await installFromUrl(name, url);
      }

      // Registry lookup: pkg install <name>
      if (!name) return '> error: usage: pkg install <name> [-a <author>] [-u <url>]';
      try {
        const registry = await fetchRegistry();
        let matches = registry.filter(p => p.name === name);

        if (authorFilter) {
          matches = matches.filter(p => p.author === authorFilter);
        }

        if (matches.length === 0) {
          return `> no package "${name}" found in registry${authorFilter ? ` by "${authorFilter}"` : ''}`;
        }

        if (matches.length > 1) {
          let msg = `> multiple packages named "${name}":\n`;
          matches.forEach((p, i) => {
            msg += `>   ${i + 1}. ${p.name} v${p.version} by ${p.author} - ${p.description}\n`;
          });
          msg += `> use -a <author> to pick one`;
          return msg.trimEnd();
        }

        const pkg = matches[0];
        return await installFromUrl(pkg.name, pkg.url, {
          author: pkg.author,
          version: pkg.version,
          description: pkg.description
        });
      } catch (err) {
        return `> registry error: ${err.message}`;
      }
    }

    // ── SEARCH ───────────────────────────────────────────────────

    if (sub === 'search') {
      const query = args.slice(1).join(' ').toLowerCase();
      if (!query) return '> usage: pkg search <query>';
      try {
        const registry = await fetchRegistry();
        const matches = registry.filter(p =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.author.toLowerCase().includes(query)
        );
        if (!matches.length) return '> no matching packages found';
        let msg = `> ${matches.length} result(s) for "${query}":\n`;
        matches.forEach(p => {
          msg += `>   ${p.name} v${p.version} by ${p.author} - ${p.description}\n`;
        });
        return msg.trimEnd();
      } catch (err) {
        return `> registry error: ${err.message}`;
      }
    }

    // ── INFO ─────────────────────────────────────────────────────

    if (sub === 'info') {
      const name = args[1];
      if (!name) return '> usage: pkg info <name>';

      const installed = ctx.gashPackages[name];
      let msg = '';
      if (installed) {
        msg += `> \ud83d\udce6 ${name} (installed)\n`;
        msg += `>   size: ${installed.code.length} chars\n`;
        msg += `>   from: ${installed.url}\n`;
        msg += `>   installed: ${new Date(installed.installed).toLocaleString()}\n`;
        if (installed.author) msg += `>   author: ${installed.author}\n`;
        if (installed.version) msg += `>   version: ${installed.version}\n`;
        if (installed.description) msg += `>   description: ${installed.description}\n`;
      }

      try {
        const registry = await fetchRegistry();
        const matches = registry.filter(p => p.name === name);
        if (matches.length > 0) {
          if (installed) msg += '>\n';
          matches.forEach(p => {
            msg += `> \ud83d\udcc1 ${p.name} v${p.version} by ${p.author}\n`;
            msg += `>   ${p.description}\n`;
            msg += `>   ${p.url}\n`;
          });
        }
      } catch (e) { /* registry offline, show installed info only */ }

      if (!msg) return `> no info for "${name}"`;
      return msg.trimEnd();
    }

    // ── RUN ──────────────────────────────────────────────────────

    if (sub === 'run') {
      const name = args[1];
      if (!name) return '> error: usage: pkg run <name> [args]';
      const pkg = ctx.gashPackages[name];
      if (!pkg) return `> package "${name}" not found (try "pkg install ${name}" first)`;
      disclaimer();
      try {
        const fn = new Function('GASH', 'ctx', 'args', 'console', 'document', 'window', pkg.code);
        const result = fn(window.GASH, ctx, args.slice(2), ctx.console || console, document, window);
        if (result !== undefined) {
          const str = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          return '> ' + str.split('\n').join('\n> ');
        }
        return '> (no return value)';
      } catch (err) {
        return `> error: ${err.message}`;
      }
    }

    // ── LIST ─────────────────────────────────────────────────────

    if (sub === 'list') {
      const names = Object.keys(ctx.gashPackages);
      if (!names.length) return '> no packages installed';
      const lines = names.map(n => {
        const p = ctx.gashPackages[n];
        const tag = p.author ? ` by ${p.author}` : '';
        return `${n}${tag} (${p.code.length} chars)`;
      });
      return '> ' + lines.join('\n> ');
    }

    // ── REMOVE ───────────────────────────────────────────────────

    if (sub === 'remove') {
      const name = args[1];
      if (!name) return '> error: usage: pkg remove <name>';
      if (ctx.gashPackages[name]) {
        delete ctx.gashPackages[name];
        ctx._savePackages();
        try { await ctx.fs.delete('/sys/bin/' + name + '.js'); } catch (e) { /* ignore */ }
        return `> removed package "${name}"`;
      }
      return `> package "${name}" not found`;
    }

    // ── CREATE (scaffold) ───────────────────────────────────────

    if (sub === 'create') {
      const name = args[1];
      if (!name) return '> error: usage: pkg create <name>';
      if (ctx.gashPackages[name]) return `> package "${name}" already exists`;

      const template = `(function () {
  const G = GASH;

  const HELP = \`${name} - A GASH package

  Usage:
    ${name} --help    Show this help\`;

  G.register('${name}', async function (args, ctx) {
    if (!args.length || args[0] === '--help') {
      return '> ' + HELP.split('\\n').join('\\n> ');
    }

    // Your code here
    return '> hello from ${name}!';
  }, HELP, 'pkg');

  G.addToConsole('> \\ud83d\\udce6 ${name} package loaded. Try: ${name} --help');
})();`;

      ctx.gashPackages[name] = { code: template, url: '', installed: Date.now() };
      ctx._savePackages();
      try {
        await ctx.fs.mkdirp('/sys/bin');
        await ctx.fs.writeFile('/sys/bin/' + name + '.js', template);
      } catch (e) { /* VFS not available */ }
      // Auto-register
      try {
        (new Function('GASH', 'ctx', 'args', 'console', 'document', 'window', template))(window.GASH, ctx, [], console, document, window);
      } catch (e) {
        return '> error executing template: ' + e.message;
      }
      return `> created package "${name}" (${template.length} chars). Try: ${name}`;
    }

    // ── SHOW ─────────────────────────────────────────────────────

    if (sub === 'show') {
      const name = args[1];
      if (!name) return '> error: usage: pkg show <name>';
      const pkg = ctx.gashPackages[name];
      if (!pkg) return `> package "${name}" not found`;
      return '> ' + pkg.code.split('\n').join('\n> ');
    }

    return '> usage: pkg <install|run|list|remove|show|search|info|create>';
  }, HELP_PKG, 'pkg');

  // ─── UTILITIES ───────────────────────────────────────────────────

  G.register('echo', async function (args, ctx) {
    if (!args.length) return '>';
    return '> ' + args.join(' ');
  }, HELP_UTIL, 'util');

  G.register('calc', async function (args, ctx) {
    if (args.length < 2) return '> error: usage: calc <op> <nums...>';
    const op = args[0].toLowerCase();
    const nums = args.slice(1).map(Number);
    if (nums.some(isNaN)) return '> error: invalid number';

    let result;
    switch (op) {
      case 'add': result = nums.reduce((a, b) => a + b, 0); break;
      case 'sub':
      case 'subtract': result = nums.reduce((a, b) => a - b); break;
      case 'mul':
      case 'multiply': result = nums.reduce((a, b) => a * b, 1); break;
      case 'div':
      case 'divide': result = nums.reduce((a, b) => a / b); break;
      case 'pow':
      case 'power': result = nums.reduce((a, b) => Math.pow(a, b)); break;
      case 'sqrt': result = Math.sqrt(nums[0]); break;
      case 'sin': result = Math.sin(nums[0]); break;
      case 'cos': result = Math.cos(nums[0]); break;
      case 'avg':
      case 'average': result = nums.reduce((a, b) => a + b, 0) / nums.length; break;
      case 'min': result = Math.min(...nums); break;
      case 'max': result = Math.max(...nums); break;
      default: return `> unknown operation: ${op} (add, sub, mul, div, pow, sqrt, sin, cos, avg, min, max)`;
    }
    return `> ${result}`;
  }, HELP_UTIL, 'util');

  G.register('flip', async function () {
    return `> ${Math.random() > 0.5 ? 'Heads' : 'Tails'}`;
  }, HELP_UTIL, 'util');

  G.register('time', async function () {
    return `> ${new Date().toLocaleTimeString()}`;
  }, HELP_UTIL, 'util');

  G.register('date', async function () {
    return `> ${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
  }, HELP_UTIL, 'util');

  G.register('clear', async function (args, ctx) {
    ctx._clearConsole();
    return null;
  }, HELP_UTIL, 'util');

  G.register('help', async function (args, ctx) {
    if (args.length) {
      const topic = args[0].toLowerCase();
      if (topic === 'fs' || topic === 'filesystem') return '> ' + HELP_FS.split('\n').join('\n> ');
      if (topic === 'text' || topic === 'text processing') return '> ' + HELP_TEXT.split('\n').join('\n> ');
      if (topic === 'net' || topic === 'networking') return '> ' + HELP_NET.split('\n').join('\n> ');
      if (topic === 'script' || topic === 'scripting') return '> ' + HELP_SCRIPT.split('\n').join('\n> ');
      if (topic === 'env' || topic === 'environment') return '> ' + HELP_ENV.split('\n').join('\n> ');
      if (topic === 'pkg' || topic === 'packages') return '> ' + HELP_PKG.split('\n').join('\n> ');
      if (topic === 'edit' || topic === 'editor') return '> ' + HELP_EDIT.split('\n').join('\n> ');
      if (topic === 'util' || topic === 'utilities') return '> ' + HELP_UTIL.split('\n').join('\n> ');

      const cmd = G.commands[topic];
      if (cmd) return '> ' + (cmd.help || `No help available for "${topic}"`).split('\n').join('\n> ');
      return `> no help for "${topic}"`;
    }

    let output = '> \ud83d\udda5 GASH - Galaxy\'s Developer Shell\n> Type "help <category>" for details:\n';
    const cats = {
      fs: 'File System', text: 'Text Processing', net: 'Networking',
      script: 'Scripting', env: 'Environment', pkg: 'Functions/Packages',
      edit: 'Editor', util: 'Utilities'
    };
    for (const [key, label] of Object.entries(cats)) {
      const cmds = G.commandCategories[key] || [];
      output += `> \n> [${label}]\n>   help ${key}\n`;
    }
    output += '\n> Special: up/down arrows for history, Tab for completion, Ctrl+R to search history';
    return output;
  }, HELP_UTIL, 'util');

  G.register('about', async function () {
    return `> \ud83d\udda5 GASH - Galaxy's Developer Shell\n> Version ${G.version || '2.0.0'}\n> Web-based shell with virtual filesystem, scripting, networking, and more.`;
  }, HELP_UTIL, 'util');

  G.register('history', async function (args, ctx) {
    if (!ctx.history || !ctx.history.length) return '> (empty)';
    const lines = ctx.history.map((cmd, i) => `${i + 1}  ${cmd}`);
    return '> ' + lines.join('\n> ');
  }, HELP_UTIL, 'util');

  G.register('updlog', async function () {
    return `> GASH 2.0 - The Intestine Upgrade
> - Virtual File System (persistent, IndexedDB)
> - Tab completion for commands and paths
> - Command piping (|) and output redirect (>)
> - Environment variables ($VAR, $(cmd))
> - Text editor (edit command)
> - Enhanced networking (POST, PUT, DELETE, headers)
> - Theme switching (6 themes)
> - Aliases, scripting, package manager
> - Text processing (grep, sort, head, tail, wc, uniq)
> - And more!`;
  }, HELP_UTIL, 'util');

  G.register('exit', async function () {
    setTimeout(() => window.close(), 2500);
    return '> Exiting GASH...';
  }, HELP_UTIL, 'util');

  G.register('sleep', async function (args) {
    const ms = parseInt(args[0]) || 1000;
    return new Promise(resolve => {
      setTimeout(() => resolve(`> slept for ${ms}ms`), ms);
    });
  }, HELP_UTIL, 'util');

  G.register('seq', async function (args) {
    const n = parseInt(args[0]) || 10;
    const nums = [];
    for (let i = 1; i <= n; i++) nums.push(i);
    return '> ' + nums.join('\n> ');
  }, HELP_UTIL, 'util');

  // ─── SYSTEM COMMANDS (gVFS) ─────────────────────────────────────

  G.register('sudo', async function (args, ctx) {
    if (!args.length) return '> error: usage: sudo <command>';
    var rootHash = localStorage.getItem('gashRootHash');
    if (!rootHash) return '> error: root password not set (re-run setup)';
    var pass = prompt('[sudo] password for root:');
    if (btoa(pass) !== rootHash) return '> error: incorrect root password';
    ctx.addToConsole('> \u269b running as root');
    await ctx.processCommand(args.join(' '));
    return null;
  }, `System Commands:
  sudo <cmd>     - Run command as root (prompts for password)
  whoami         - Show current username
  id             - Show user identity
  hostname [n]   - Show or set hostname
  passwd         - Change account password`, 'sys');

  G.register('whoami', async function (args, ctx) {
    return '> ' + (ctx.vars.USER || 'gashuser');
  }, 'Show current username', 'sys');

  G.register('id', async function (args, ctx) {
    var user = ctx.vars.USER || 'gashuser';
    var home = ctx.vars.HOME || '/home/' + user;
    return '> uid=1000(' + user + ') gid=1000(' + user + ') groups=1000(' + user + ')';
  }, 'Show user identity', 'sys');

  G.register('hostname', async function (args, ctx) {
    if (args.length) {
      ctx.hostname = args[0];
      try { await ctx.fs.writeFile('/etc/hostname', args[0]); } catch (e) { /* ignore */ }
      ctx._updatePrompt();
      return '> hostname set to ' + args[0];
    }
    var h = ctx.hostname || 'gashbox';
    return '> ' + h;
  }, 'Show or set hostname', 'sys');

  G.register('passwd', async function (args, ctx) {
    var currentHash = localStorage.getItem('gashRootHash');
    if (!currentHash) return '> error: root password not set';
    var old = prompt('Current password:');
    if (btoa(old) !== currentHash) return '> error: incorrect password';
    var new1 = prompt('New password:');
    var new2 = prompt('Retype new password:');
    if (new1 !== new2) return '> error: passwords do not match';
    localStorage.setItem('gashRootHash', btoa(new1));
    // Update /etc/shadow
    try {
      var shadow = await ctx.fs.readFile('/etc/shadow');
      var lines = shadow.split('\n');
      var rootLine = lines.findIndex(function (l) { return l.startsWith('root:'); });
      if (rootLine !== -1) {
        lines[rootLine] = 'root:' + btoa(new1) + ':19000:0:99999:7:::';
        await ctx.fs.writeFile('/etc/shadow', lines.join('\n'));
      }
    } catch (e) { /* ignore */ }
    return '> password updated';
  }, 'Change account password', 'sys');

  // ─── SSH: WebSocket SSH proxy client ────────────────────────────

  G.register('ssh', async function (args, ctx) {
    if (!args.length) return '> usage: ssh <host> | --proxy <url> | --show-proxy';

    if (args[0] === '--proxy') {
      if (!args[1]) return '> error: --proxy requires a URL';
      ctx.vars._sshProxy = args[1];
      return '> SSH proxy set to ' + args[1];
    }

    if (args[0] === '--show-proxy') {
      return '> SSH proxy: ' + (ctx.vars._sshProxy || '(not set)');
    }

    if (G.inputHook) return '> already in a session (type exit to disconnect)';

    var host = args[0];
    var proxy = ctx.vars._sshProxy;
    if (!proxy) return '> error: no SSH proxy set. Use: ssh --proxy <wss://url>';

    ctx.addToConsole('> Connecting to ' + host + ' via ' + proxy + '...');

    var ws;
    try {
      ws = new WebSocket(proxy + '/' + host);
    } catch (e) {
      return '> error: ' + e.message;
    }

    var connected = false;
    var savedUpdatePrompt = G._updatePrompt;

    function cleanup() {
      if (G.inputHook) {
        G.inputHook = null;
        G._updatePrompt = savedUpdatePrompt;
        G._updatePrompt();
      }
    }

    ws.addEventListener('open', function () {
      connected = true;
      ctx.addToConsole('> Connected to ' + host);
      ctx.addToConsole('> Type exit to disconnect.');

      G.inputHook = function (line) {
        if (line === 'exit' || line === 'quit') {
          ws.close();
          return;
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(line + '\n');
        }
      };

      G._updatePrompt = function () {
        if (G.inputHook) {
          document.getElementById('prompt-label').textContent = 'ssh> ';
        } else {
          savedUpdatePrompt.call(G);
        }
        var inp = document.getElementById('input-field');
        if (inp && document.activeElement !== inp) inp.focus();
      };
      G._updatePrompt();
    });

    ws.addEventListener('message', function (e) {
      ctx.addToConsole('> ' + e.data.replace(/\n$/, '').split('\n').join('\n> '));
    });

    ws.addEventListener('close', function () {
      cleanup();
      ctx.addToConsole('> Disconnected from ' + host);
    });

    ws.addEventListener('error', function () {
      if (!connected) {
        ctx.addToConsole('> Connection failed to ' + host, 'error-output');
      } else {
        cleanup();
      }
    });

    return null;
  }, 'SSH client via WebSocket proxy\n  ssh <host>           Connect to host via SSH proxy\n  ssh --proxy <url>    Set WebSocket proxy URL\n  ssh --show-proxy     Show current proxy URL', 'sys');

  // ─── JOB CONTROL ──────────────────────────────────────────────────

  G.register(['jobs', 'ps'], async function (args, ctx) {
    var ids = Object.keys(G.jobs);
    if (!ids.length) return '> no running jobs';
    var lines = ids.map(function (id) {
      var j = G.jobs[id];
      var elapsed = Math.round((Date.now() - j.timestamp) / 1000) + 's';
      return '[' + id + '] ' + j.status + '  ' + elapsed + '  ' + j.command;
    });
    return '> ' + lines.join('\n> ');
  }, 'List background jobs', 'sys');

  G.register('fg', async function (args, ctx) {
    if (!args.length) return '> error: usage: fg <jobid>';
    var id = parseInt(args[0]);
    var job = G.jobs[id];
    if (!job) return '> error: job ' + id + ' not found';
    if (job.status !== 'running' && job.status !== 'suspended') return '> error: job ' + id + ' is ' + job.status;
    ctx.addToConsole('> waiting for job [' + id + ']...');
    try { await job.promise; } catch (e) { /* ignore */ }
    return null;
  }, 'Bring job to foreground\n  fg <jobid>    Wait for a background job to complete', 'sys');

  G.register('bg', async function (args, ctx) {
    if (!args.length) return '> error: usage: bg <jobid>';
    var id = parseInt(args[0]);
    var job = G.jobs[id];
    if (!job) return '> error: job ' + id + ' not found';
    job.status = 'running';
    return '> job [' + id + '] resumed in background';
  }, 'Resume job in background\n  bg <jobid>', 'sys');

  G.register('kill', async function (args, ctx) {
    if (!args.length) return '> error: usage: kill <jobid>';
    var id = parseInt(args[0]);
    var job = G.jobs[id];
    if (!job) return '> error: job ' + id + ' not found';
    delete G.jobs[id];
    return '> job [' + id + '] terminated';
  }, 'Terminate a job\n  kill <jobid>', 'sys');

  G.register('which', async function (args, ctx) {
    if (!args.length) return '> error: usage: which <command>';
    const cmd = args[0];
    if (G.commands[cmd]) return `> ${cmd} is a built-in command (${G.commands[cmd].category})`;
    if (ctx.aliases[cmd]) return `> ${cmd} is aliased to \`${ctx.aliases[cmd]}\``;
    if (ctx.gashFunctions[cmd]) return `> ${cmd} is a user-defined function`;
    return `> ${cmd} not found`;
  }, HELP_UTIL, 'util');

  G.register('type', async function (args, ctx) {
    if (!args.length) return '> error: usage: type <command>';
    const cmd = args[0];
    if (G.commands[cmd]) return `> ${cmd} is a shell builtin`;
    if (ctx.aliases[cmd]) return `> ${cmd} is an alias`;
    if (ctx.gashFunctions[cmd]) return `> ${cmd} is a function`;
    const exists = await ctx.fs.exists(ctx.fs.normalizePath(cmd));
    if (exists) return `> ${cmd} is a file`;
    return `> ${cmd} not found`;
  }, HELP_UTIL, 'util');

  G.register('app', async function (args, ctx) {
    if (args[0] !== 'run' || !args[1]) return '> usage: app run <name>';
    const name = args[1];
    const appPath = `src/apps/${name}.html`;
    try {
      const res = await fetch(appPath, { method: 'HEAD' });
      if (res.ok) {
        window.open(appPath, '_blank');
        return `> opened ${name}.html`;
      }
      return `> error: app "${name}.html" not found in src/apps/`;
    } catch (err) {
      return `> error: ${err.message}`;
    }
  }, HELP_UTIL, 'util');

  // localstr/ls - local storage commands
  G.register('localstr', async function (args, ctx) {
    if (!args.length) return '> usage: localstr <set|get|list|del|wipe> [args]';
    const sub = args[0];

    if (sub === 'set') {
      if (args.length < 3) return '> usage: localstr set <key> <value>';
      const key = args[1];
      const val = args.slice(2).join(' ');
      localStorage.setItem(key, val);
      return `> stored '${val}' under key '${key}'`;
    }

    if (sub === 'get') {
      const key = args[1];
      if (!key) return '> usage: localstr get <key>';
      const val = localStorage.getItem(key);
      return val != null ? `> ${key}: ${val}` : `> key '${key}' not found`;
    }

    if (sub === 'list') {
      const keys = Object.keys(localStorage);
      if (!keys.length) return '> no keys in local storage';
      return '> ' + keys.map(k => `${k}: ${localStorage.getItem(k)}`).join('\n> ');
    }

    if (sub === 'del' || sub === 'delete') {
      const key = args[1];
      if (!key) return '> usage: localstr del <key>';
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        return `> deleted key '${key}'`;
      }
      return `> key '${key}' not found`;
    }

    if (sub === 'wipe') {
      const captcha = Math.random().toString(36).slice(2, 8);
      ctx.addToConsole(`> Are you sure? Type '${captcha}' to confirm or 'no' to cancel.`);
      ctx.waitingForFunction = { type: 'wipe', code: captcha };
      return null;
    }

    return '> usage: localstr <set|get|list|del|wipe>';
  }, HELP_UTIL, 'util');

  // ─── FIGLET ──────────────────────────────────────────────────────

  G.register('figlet', async function (args) {
    if (!args.length) return '> error: usage: figlet <text>';
    var text = args.join(' ');
    var chars = text.toUpperCase().split('');
    var lines = ['', '', '', '', ''];
    var font = {
      'A': [' AA ', 'A  A', 'AAAA', 'A  A', 'A  A'],
      'B': ['BBB ', 'B  B', 'BBB ', 'B  B', 'BBB '],
      'C': [' CCC', 'C   ', 'C   ', 'C   ', ' CCC'],
      'D': ['DDD ', 'D  D', 'D  D', 'D  D', 'DDD '],
      'E': ['EEEE', 'E   ', 'EEE ', 'E   ', 'EEEE'],
      'F': ['FFFF', 'F   ', 'FFF ', 'F   ', 'F   '],
      'G': [' GGG', 'G   ', 'G GG', 'G  G', ' GGG'],
      'H': ['H  H', 'H  H', 'HHHH', 'H  H', 'H  H'],
      'I': ['III', ' I ', ' I ', ' I ', 'III'],
      'J': ['  JJ', '   J', '   J', 'J  J', ' JJ '],
      'K': ['K  K', 'K K ', 'KK  ', 'K K ', 'K  K'],
      'L': ['L   ', 'L   ', 'L   ', 'L   ', 'LLLL'],
      'M': ['M   M', 'MM MM', 'M M M', 'M   M', 'M   M'],
      'N': ['N  N', 'NN N', 'N NN', 'N  N', 'N  N'],
      'O': [' OO ', 'O  O', 'O  O', 'O  O', ' OO '],
      'P': ['PPP ', 'P  P', 'PPP ', 'P   ', 'P   '],
      'Q': [' QQ ', 'Q  Q', 'Q  Q', 'Q QQ', ' QQ '],
      'R': ['RRR ', 'R  R', 'RRR ', 'R R ', 'R  R'],
      'S': [' SSS', 'S   ', ' SS ', '   S', 'SSS '],
      'T': ['TTTT', '  T ', '  T ', '  T ', '  T '],
      'U': ['U  U', 'U  U', 'U  U', 'U  U', ' UU '],
      'V': ['V  V', 'V  V', 'V  V', ' VV ', '  V '],
      'W': ['W   W', 'W   W', 'W W W', 'W W W', ' W W '],
      'X': ['X  X', ' X X', '  X ', ' X X', 'X  X'],
      'Y': ['Y  Y', 'Y  Y', ' YY ', '  Y ', '  Y '],
      'Z': ['ZZZZ', '   Z', '  Z ', ' Z  ', 'ZZZZ'],
      ' ': ['    ', '    ', '    ', '    ', '    '],
      '!': ['!', '!', '!', ' ', '!'],
      '?': ['???', '  ?', ' ? ', '   ', ' ? '],
      '0': ['000', '0 0', '0 0', '0 0', '000'],
      '1': [' 1 ', ' 11', ' 1 ', ' 1 ', '111'],
      '2': ['222', '  2', '222', '2  ', '222'],
      '3': ['333', '  3', '333', '  3', '333'],
      '4': ['4 4', '4 4', '444', '  4', '  4'],
      '5': ['555', '5  ', '555', '  5', '555'],
      '6': ['666', '6  ', '666', '6 6', '666'],
      '7': ['777', '  7', '  7', ' 7 ', '7  '],
      '8': ['888', '8 8', '888', '8 8', '888'],
      '9': ['999', '9 9', '999', '  9', '999']
    };
    for (var row = 0; row < 5; row++) {
      for (var ci = 0; ci < chars.length; ci++) {
        var f = font[chars[ci]];
        lines[row] += f ? f[row] : ' ?? ';
        if (ci < chars.length - 1) lines[row] += ' ';
      }
    }
    return '> ' + lines.join('\n> ');
  }, 'Generate ASCII art banner\n  figlet <text>', 'util');

  // ─── WEATHER ────────────────────────────────────────────────────

  G.register('weather', async function (args) {
    var city = args.join(' ') || '';
    var url = city ? 'https://wttr.in/' + encodeURIComponent(city) + '?format=4' : 'https://wttr.in?format=4';
    try {
      var res = await fetch(url);
      if (!res.ok) return '> error: HTTP ' + res.status;
      var text = await res.text();
      return '> ' + text.trim();
    } catch (e) {
      return '> error: ' + e.message;
    }
  }, 'Show weather forecast\n  weather [city]', 'util');

  // ─── TOP ──────────────────────────────────────────────────────────

  G.register('top', async function (args, ctx) {
    var jobsCount = Object.keys(G.jobs || {}).length;
    var fsCount = 0;
    try { var all = await ctx.fs._getAll(); fsCount = all.length; } catch (e) { /* ignore */ }
    var now = new Date();
    var uptime = Math.round((Date.now() - performance.timing.navigationStart) / 1000) + 's';
    var mem = navigator.deviceMemory ? navigator.deviceMemory + 'GB' : 'N/A';
    var conn = navigator.connection ? navigator.connection.effectiveType : 'N/A';
    return '> ' + [
      'GASH v' + G.version + '  |  uptime: ' + uptime,
      'user: ' + (ctx.vars.USER || 'gashuser') + '  |  hostname: ' + (G.hostname || 'gashbox'),
      'CWD: ' + ctx.fs.cwd,
      'VFS files: ' + fsCount + '  |  jobs: ' + jobsCount,
      'RAM: ' + mem + '  |  connection: ' + conn,
      'history: ' + ctx.history.length + ' entries'
    ].join('\n> ');
  }, 'Show system information\n  top', 'util');

  // ─── MAN ──────────────────────────────────────────────────────────

  G.register('man', async function (args) {
    if (!args.length) return '> error: usage: man <command>';
    var topic = args[0].toLowerCase();
    var cmd = G.commands[topic];
    if (!cmd) return '> no manual entry for ' + topic;
    var help = cmd.help || 'No help available.';
    var category = cmd.category || 'unknown';
    return '> ' + [
      '',
      topic + '(' + category + ')',
      '',
      help
    ].join('\n> ');
  }, 'Show detailed command help\n  man <command>', 'util');

  // ─── CRON ─────────────────────────────────────────────────────────

  G.register('cron', async function (args, ctx) {
    if (!args.length) return '> usage: cron <list|add|rm> [args]';
    var sub = args[0];

    if (sub === 'list') {
      try {
        var entries = await ctx.fs.readdir('/var/spool/cron');
        if (!entries.length) return '> no cron jobs';
        var out = [];
        for (var ei = 0; ei < entries.length; ei++) {
          var e = entries[ei];
          if (e.type === 'file') {
            var content = await ctx.fs.readFile('/var/spool/cron/' + e.name);
            out.push(e.name + ': ' + content);
          }
        }
        return '> ' + out.join('\n> ');
      } catch (e) { return '> no cron jobs'; }
    }

    if (sub === 'add') {
      if (args.length < 3) return '> error: usage: cron add <interval_sec> <command>';
      var interval = parseInt(args[1]);
      if (isNaN(interval) || interval < 1) return '> error: interval must be a positive number';
      var cmdStr = args.slice(2).join(' ');
      var name = 'cron_' + Date.now();
      try {
        await ctx.fs.mkdirp('/var/spool/cron');
        await ctx.fs.writeFile('/var/spool/cron/' + name, interval + ' ' + cmdStr);
        return '> installed cron job: ' + name + ' (every ' + interval + 's)';
      } catch (e) { return '> error: ' + e.message; }
    }

    if (sub === 'rm' || sub === 'remove') {
      if (!args[1]) return '> error: usage: cron rm <jobname>';
      var path = '/var/spool/cron/' + args[1];
      try {
        if (await ctx.fs.exists(path)) {
          await ctx.fs.delete(path);
          return '> removed cron job: ' + args[1];
        }
        return '> cron job not found: ' + args[1];
      } catch (e) { return '> error: ' + e.message; }
    }

    return '> usage: cron <list|add|rm>';
  }, 'Scheduler (tasks stored in /var/spool/cron/)\n  cron add <sec> <cmd>    Add a recurring command\n  cron list               List cron jobs\n  cron rm <name>          Remove a cron job', 'sys');

  // ─── SERVE (HTTP via Service Worker) ──────────────────────────

  G.register('serve', async function (args, ctx) {
    var port = args[0] || '8080';
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      ctx.addToConsole('> Service Worker active. Serving VFS on port ' + port + '...');
      ctx.addToConsole('> (open DevTools > Application > Service Workers to see status)');
      return null;
    } else if ('serviceWorker' in navigator) {
      ctx.addToConsole('> Registering Service Worker for HTTP serving...');
      try {
        var reg = await navigator.serviceWorker.register('/sw.js');
        ctx.addToConsole('> SW registered. VFS files should be served at origin.');
        ctx.addToConsole('> Note: requires sw.js in the root directory.');
      } catch (e) {
        return '> error: ' + e.message;
      }
      return null;
    }
    return '> Service Workers not supported in this browser.';
  }, 'Start HTTP file server (via Service Worker)\n  serve [port]', 'sys');

  // Easter eggs
  G.register('game', async function () {
    return '> ' + 'A'.repeat(200);
  }, 'hidden', 'util');

  G.register('us4', async function (args) {
    if (args[0] === 'link') {
      window.open('https://voucan.github.io/link-hub', '_blank');
      return '> opening US4 link hub...';
    }
    if (args[0] === 'open') {
      const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
      const rl = letters[Math.floor(Math.random() * letters.length)];
      window.open(`https://us4-${rl}.global.ssl.fastly.net/cloak`, '_blank');
      return '> opening US4 unblocked games...';
    }
    return '> usage: us4 <link|open>';
  }, 'hidden', 'util');

  G.register('JaydenDash6', async function () {
    alert('what.');
    return '> how do you know my geometry dash name?!';
  }, 'hidden', 'util');

})();
