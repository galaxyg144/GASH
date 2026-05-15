(function () {
  'use strict';

  window.GASH = window.GASH || {};
  var G = window.GASH;

  class Editor {
    constructor() {
      this.active = false;
      this.filename = null;
      this.lines = [];
      this.modified = false;
      this.overlay = null;
      this.textarea = null;
      this.mode = 'visual';
      this.fs = null;
    }

    async open(filename, fs, mode) {
      this.filename = filename;
      this.active = true;
      this.modified = false;
      this.fs = fs;
      this.mode = mode || 'visual';
      try {
        if (await fs.exists(filename)) {
          var content = await fs.readFile(filename);
          this.lines = content ? content.split('\n') : [''];
        } else {
          this.lines = [''];
        }
      } catch (e) {
        this.lines = [''];
      }
      if (this.mode === 'visual') {
        this._createOverlay();
        return '> \u270f opened ' + filename + ' (visual mode)';
      }
      return this._render();
    }

    _createOverlay() {
      var consoleEl = document.getElementById('console-output');
      var promptEl = document.getElementById('prompt');
      if (consoleEl) consoleEl.style.display = 'none';
      if (promptEl) promptEl.style.display = 'none';

      this.overlay = document.createElement('div');
      this.overlay.id = 'editor-overlay';

      var header = document.createElement('div');
      header.id = 'editor-header';
      header.innerHTML = '\u270f <span id="editor-filename">' + this._esc(this.filename) + '</span><span id="editor-status"></span>';

      this.textarea = document.createElement('textarea');
      this.textarea.id = 'editor-textarea';
      this.textarea.value = this.lines.join('\n');
      this.textarea.spellcheck = false;

      var footer = document.createElement('div');
      footer.id = 'editor-footer';
      footer.textContent = 'Ctrl+S save  |  Esc save && quit  |  Tab: 4 spaces';

      this.overlay.appendChild(header);
      this.overlay.appendChild(this.textarea);
      this.overlay.appendChild(footer);

      if (G.config && G.config.theme && G.config.theme !== 'default') {
        this.overlay.className = 'theme-' + G.config.theme;
      }

      document.body.appendChild(this.overlay);
      this.textarea.focus();
      this.textarea.addEventListener('keydown', this._onKey.bind(this));
    }

    _esc(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    _onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this._saveVisual();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this._closeVisual();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        var start = this.textarea.selectionStart;
        var end = this.textarea.selectionEnd;
        this.textarea.value = this.textarea.value.substring(0, start) + '    ' + this.textarea.value.substring(end);
        this.textarea.selectionStart = this.textarea.selectionEnd = start + 4;
        return;
      }
    }

    _status(msg) {
      var el = document.getElementById('editor-status');
      if (el) { el.textContent = '  (' + msg + ')'; }
    }

    async _saveVisual() {
      try {
        await this.fs.writeFile(this.filename, this.textarea.value);
        this.lines = this.textarea.value.split('\n');
        this.modified = false;
        this._status('saved');
        var self = this;
        setTimeout(function () { self._status(''); }, 2000);
      } catch (e) {
        this._status('save failed: ' + e.message);
      }
    }

    async _closeVisual() {
      await this._saveVisual();
      this._destroyOverlay();
      this.active = false;
      G.editorMode = false;
      G._updatePrompt();
      G.addToConsole('> closed ' + this.filename);
    }

    _destroyOverlay() {
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
      this.overlay = null;
      this.textarea = null;
      var consoleEl = document.getElementById('console-output');
      var promptEl = document.getElementById('prompt');
      if (consoleEl) consoleEl.style.display = '';
      if (promptEl) promptEl.style.display = '';
      var inp = document.getElementById('input-field');
      if (inp) inp.focus();
    }

    _render() {
      var out = '> \u270f EDITING: ' + this.filename + '\n';
      if (this.modified) out += '> (modified)\n';
      out += '> ' + '\u2500'.repeat(50) + '\n';
      var lw = String(this.lines.length).length;
      for (var i = 0; i < this.lines.length; i++) {
        out += '> ' + String(i + 1).padStart(lw, ' ') + ' | ' + this.lines[i] + '\n';
      }
      out += '> ' + '\u2500'.repeat(50) + '\n';
      out += '> :h for help, :v for visual mode';
      return out;
    }

    processCommand(input) {
      if (!this.active) return null;
      var trimmed = input.trim();
      if (!trimmed.startsWith(':')) {
        return { output: '> Editor: commands must start with ":"\n> :h for help', stayOpen: true };
      }
      var cmd = trimmed.slice(1).trim();
      var parts = cmd.split(/\s+/);
      var action = parts[0];
      var args = parts.slice(1);

      switch (action) {
        case 'h':
        case 'help': {
          var help = [
            'Editor Commands:',
            '  :i <line> <text>   - Insert text at line number',
            '  :a <text>          - Append text to end of file',
            '  :d <line>          - Delete line by number',
            '  :r <line> <text>   - Replace line at number',
            '  :w                 - Save file',
            '  :q                 - Quit without saving',
            '  :wq                - Save and quit',
            '  :p                 - Print file with line numbers',
            '  :n                 - Show number of lines',
            '  :c                 - Clear all lines',
            '  :v                 - Switch to visual (textarea) mode',
            '  :h                 - Show this help'
          ].join('\n');
          return { output: '> ' + help.split('\n').join('\n> '), stayOpen: true };
        }

        case 'v':
        case 'visual': {
          this._createOverlay();
          return { output: null, stayOpen: false };
        }

        case 'p':
        case 'print':
          return { output: this._render(), stayOpen: true };

        case 'n':
        case 'lines':
          return { output: '> ' + this.lines.length + ' lines', stayOpen: true };

        case 'c':
        case 'clear':
          this.lines = [''];
          this.modified = true;
          return { output: '> all lines cleared', stayOpen: true };

        case 'i':
        case 'insert': {
          var lineNum = parseInt(args[0]);
          if (isNaN(lineNum) || lineNum < 1)
            return { output: '> usage: :i <line> <text>', stayOpen: true };
          var text = args.slice(1).join(' ');
          var idx = Math.min(lineNum - 1, this.lines.length);
          this.lines.splice(idx, 0, text);
          this.modified = true;
          return { output: '> inserted at line ' + lineNum + '\n' + this._render(), stayOpen: true };
        }

        case 'a':
        case 'append':
          var text = args.join(' ');
          this.lines.push(text);
          this.modified = true;
          return { output: '> appended line ' + this.lines.length + '\n' + this._render(), stayOpen: true };

        case 'd':
        case 'delete': {
          var lineNum = parseInt(args[0]);
          if (isNaN(lineNum) || lineNum < 1 || lineNum > this.lines.length)
            return { output: '> invalid line: ' + args[0], stayOpen: true };
          var deleted = this.lines.splice(lineNum - 1, 1)[0];
          if (this.lines.length === 0) this.lines = [''];
          this.modified = true;
          return { output: '> deleted line ' + lineNum + ': ' + deleted + '\n' + this._render(), stayOpen: true };
        }

        case 'r':
        case 'replace': {
          var lineNum = parseInt(args[0]);
          if (isNaN(lineNum) || lineNum < 1 || lineNum > this.lines.length)
            return { output: '> invalid line: ' + args[0], stayOpen: true };
          var text = args.slice(1).join(' ');
          this.lines[lineNum - 1] = text;
          this.modified = true;
          return { output: '> replaced line ' + lineNum + '\n' + this._render(), stayOpen: true };
        }

        case 'w':
        case 'save':
          return { output: null, stayOpen: true, saveAndContinue: true };

        case 'q':
        case 'quit':
          if (this.modified)
            return { output: '> file modified! Use :wq to save and quit, :q! to force quit', stayOpen: true };
          this.active = false;
          return { output: '> closed editor (' + this.filename + ')', stayOpen: false, saved: false };

        case 'q!':
        case 'quit!':
          this.active = false;
          return { output: '> closed editor without saving (' + this.filename + ')', stayOpen: false, saved: false };

        case 'wq':
        case 'x':
        case 'savequit':
          return { output: null, stayOpen: false, saveAndQuit: true };

        default:
          return { output: '> unknown editor command: :' + action + '\n> :h for help', stayOpen: true };
      }
    }

    async save(fs) {
      var content = this.lines.join('\n');
      await fs.writeFile(this.filename, content);
      this.modified = false;
    }
  }

  G.Editor = Editor;
})();
