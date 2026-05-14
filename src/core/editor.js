(function () {
  'use strict';

  window.GASH = window.GASH || {};
  const G = window.GASH;

  class Editor {
    constructor() {
      this.active = false;
      this.filename = null;
      this.lines = [];
      this.modified = false;
    }

    async open(filename, fs) {
      this.filename = filename;
      this.active = true;
      this.modified = false;

      try {
        if (await fs.exists(filename)) {
          const content = await fs.readFile(filename);
          this.lines = content ? content.split('\n') : [''];
        } else {
          this.lines = [''];
        }
      } catch (e) {
        this.lines = [''];
      }

      return this._render();
    }

    _render() {
      let out = `> \u270f EDITING: ${this.filename}\n`;
      if (this.modified) out += '> (modified)\n';
      out += '> ' + '\u2500'.repeat(50) + '\n';
      const lineWidth = String(this.lines.length).length;
      for (let i = 0; i < this.lines.length; i++) {
        const lineNum = String(i + 1).padStart(lineWidth, ' ');
        out += `> ${lineNum} | ${this.lines[i]}\n`;
      }
      out += '> ' + '\u2500'.repeat(50) + '\n';
      out += '> Type :h for editor help';
      return out;
    }

    processCommand(input) {
      if (!this.active) return null;

      const trimmed = input.trim();

      if (!trimmed.startsWith(':')) {
        return { output: '> Editor: commands must start with ":"\n> :h for help', stayOpen: true };
      }

      const cmd = trimmed.slice(1).trim();
      const parts = cmd.split(/\s+/);
      const action = parts[0];
      const args = parts.slice(1);

      switch (action) {
        case 'h':
        case 'help': {
          const help = `Editor Commands:
  :i <line> <text>   - Insert text at line number
  :a <text>          - Append text to end of file
  :d <line>          - Delete line by number
  :r <line> <text>   - Replace line at number
  :w                 - Save file
  :q                 - Quit without saving
  :wq                - Save and quit
  :p                 - Print file with line numbers
  :n                 - Show number of lines
  :c                 - Clear all lines
  :h                 - Show this help`;
          return { output: '> ' + help.split('\n').join('\n> '), stayOpen: true };
        }

        case 'p':
        case 'print': {
          return { output: this._render(), stayOpen: true };
        }

        case 'n':
        case 'lines': {
          return { output: `> ${this.lines.length} lines`, stayOpen: true };
        }

        case 'c':
        case 'clear': {
          this.lines = [''];
          this.modified = true;
          return { output: '> all lines cleared', stayOpen: true };
        }

        case 'i':
        case 'insert': {
          const lineNum = parseInt(args[0]);
          if (isNaN(lineNum) || lineNum < 1) {
            return { output: '> usage: :i <line> <text>', stayOpen: true };
          }
          const text = args.slice(1).join(' ');
          const idx = Math.min(lineNum - 1, this.lines.length);
          this.lines.splice(idx, 0, text);
          this.modified = true;
          return {
            output: `> inserted at line ${lineNum}\n` + this._render(),
            stayOpen: true
          };
        }

        case 'a':
        case 'append': {
          const text = args.join(' ');
          this.lines.push(text);
          this.modified = true;
          return {
            output: `> appended line ${this.lines.length}\n` + this._render(),
            stayOpen: true
          };
        }

        case 'd':
        case 'delete': {
          const lineNum = parseInt(args[0]);
          if (isNaN(lineNum) || lineNum < 1 || lineNum > this.lines.length) {
            return { output: `> invalid line: ${args[0]}`, stayOpen: true };
          }
          const deleted = this.lines.splice(lineNum - 1, 1)[0];
          if (this.lines.length === 0) this.lines = [''];
          this.modified = true;
          return {
            output: `> deleted line ${lineNum}: ${deleted}\n` + this._render(),
            stayOpen: true
          };
        }

        case 'r':
        case 'replace': {
          const lineNum = parseInt(args[0]);
          if (isNaN(lineNum) || lineNum < 1 || lineNum > this.lines.length) {
            return { output: `> invalid line: ${args[0]}`, stayOpen: true };
          }
          const text = args.slice(1).join(' ');
          this.lines[lineNum - 1] = text;
          this.modified = true;
          return {
            output: `> replaced line ${lineNum}\n` + this._render(),
            stayOpen: true
          };
        }

        case 'w':
        case 'save': {
          return {
            output: null,
            stayOpen: true,
            saveAndContinue: true
          };
        }

        case 'q':
        case 'quit': {
          if (this.modified) {
            return {
              output: '> file modified! Use :wq to save and quit, :q! to force quit without saving',
              stayOpen: true
            };
          }
          this.active = false;
          return {
            output: `> closed editor (${this.filename})`,
            stayOpen: false,
            saved: false
          };
        }

        case 'q!':
        case 'quit!': {
          this.active = false;
          return {
            output: `> closed editor without saving (${this.filename})`,
            stayOpen: false,
            saved: false
          };
        }

        case 'wq':
        case 'x':
        case 'savequit': {
          return {
            output: null,
            stayOpen: false,
            saveAndQuit: true
          };
        }

        default:
          return { output: `> unknown editor command: :${action}\n> :h for help`, stayOpen: true };
      }
    }

    async save(fs) {
      let content = this.lines.join('\n');
      if (content.endsWith('\n') === false && this.lines.length > 0) {
        // keep as-is
      }
      await fs.writeFile(this.filename, content);
      this.modified = false;
    }
  }

  G.Editor = Editor;
})();
