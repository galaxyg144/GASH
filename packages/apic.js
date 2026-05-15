(function () {
  const G = GASH;

  const HELP = `apic - Terminal API Client (GASH port)
  Usage: apic <url> [options]

  HTTP Methods (mutually exclusive, default GET):
    -g                 GET request
    -p                 POST request
    -pu                PUT request
    -pa                PATCH request
    -d                 DELETE request
    -hE, --head        HEAD request

  Options:
    -H, --header <kv>  Custom header (repeatable): -H 'Authorization: Bearer x'
    -B, --body <json>  Request body (auto-detects JSON)
    -q, --query <kv>   Query params: key=value&key2=value2
    -T, --tokfile <p>  Read token from VFS file (.atf): sets Authorization
    -o, --output <p>   Save response to VFS file
    -v, --verbose      Show request details
    -t <secs>          Timeout in seconds (default 10)

  Examples:
    apic https://api.github.com/users/octocat -g
    apic https://api.example.com/data -p -B '{"name":"test"}' -H 'Content-Type: application/json'
    apic https://api.example.com/search -q 'q=hello&limit=5'`;

  function parseTokFile(path, ctx) {
    return ctx.fs.readFile(path).then(function (content) {
      var lines = content.split('\n').filter(function (l) {
        var t = l.trim();
        return t && !t.startsWith('#');
      });
      var scheme = null, token = null, section = null;
      lines.forEach(function (line) {
        var t = line.trim();
        if (t === '[SCHEME]') section = 'scheme';
        else if (t === '[TOKEN]') section = 'token';
        else if (section === 'scheme' && !scheme) scheme = t;
        else if (section === 'token' && !token) token = t;
      });
      if (!scheme || !token) throw new Error('invalid .atf file: missing [SCHEME] or [TOKEN]');
      return scheme + ' ' + token;
    });
  }

  G.register('apic', async function (args, ctx) {
    if (!args.length) return '> ' + HELP.split('\n').join('\n> ');

    var url = null;
    var method = 'GET';
    var headers = {};
    var body = null;
    var queryStr = null;
    var tokfile = null;
    var outputPath = null;
    var verbose = false;
    var timeout = 10;
    var fileUploads = [];

    // Parse args manually (no argparse in browser)
    var i = 0;
    var positional = [];

    while (i < args.length) {
      var a = args[i];
      if (a === '-g') { method = 'GET'; i++; }
      else if (a === '-p') { method = 'POST'; i++; }
      else if (a === '-pu') { method = 'PUT'; i++; }
      else if (a === '-pa') { method = 'PATCH'; i++; }
      else if (a === '-d') { method = 'DELETE'; i++; }
      else if (a === '-hE' || a === '--head') { method = 'HEAD'; i++; }
      else if (a === '-H' || a === '--header') {
        var hv = args[++i];
        if (!hv) return '> error: -H requires a value';
        var idx = hv.indexOf(':');
        if (idx === -1) return '> error: invalid header format: ' + hv;
        headers[hv.slice(0, idx).trim()] = hv.slice(idx + 1).trim();
        i++;
      }
      else if (a === '-B' || a === '--body') {
        body = args[++i];
        if (body == null) return '> error: -B requires a value';
        i++;
      }
      else if (a === '-q' || a === '--query') {
        queryStr = args[++i];
        if (!queryStr) return '> error: -q requires a value';
        i++;
      }
      else if (a === '-T' || a === '--tokfile') {
        tokfile = args[++i];
        if (!tokfile) return '> error: -T requires a path';
        i++;
      }
      else if (a === '-o' || a === '--output') {
        outputPath = args[++i];
        if (!outputPath) return '> error: -o requires a path';
        i++;
      }
      else if (a === '-v' || a === '--verbose') { verbose = true; i++; }
      else if (a === '-t') {
        timeout = parseInt(args[++i], 10);
        if (isNaN(timeout) || timeout < 1) return '> error: -t requires a positive number';
        i++;
      }
      else if (a === '-F' || a === '--file') {
        var fv = args[++i];
        if (!fv) return '> error: -F requires a value (field=@path)';
        fileUploads.push(fv);
        i++;
      }
      else if (a.startsWith('-')) {
        return '> error: unknown flag: ' + a;
      }
      else {
        positional.push(a);
        i++;
      }
    }

    url = positional[0];
    if (!url) return '> error: URL is required';

    // Query params
    var params = {};
    if (queryStr) {
      queryStr.split('&').forEach(function (pair) {
        var eq = pair.indexOf('=');
        if (eq !== -1) params[pair.slice(0, eq)] = pair.slice(eq + 1);
      });
    }

    // Token file
    if (tokfile) {
      try {
        var authVal = await parseTokFile(tokfile, ctx);
        if (!headers['Authorization']) headers['Authorization'] = authVal;
      } catch (e) {
        return '> error: tokfile: ' + e.message;
      }
    }

    // Body (auto-detect JSON)
    var fetchBody = null;
    var isJson = false;
    if (body) {
      try {
        fetchBody = JSON.parse(body);
        isJson = true;
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
      } catch (e) {
        fetchBody = body;
      }
    }

    // File uploads
    var useFormData = fileUploads.length > 0;
    if (useFormData) {
      var formData = new FormData();
      for (var fi = 0; fi < fileUploads.length; fi++) {
        var fv = fileUploads[fi];
        var eqIdx = fv.indexOf('=');
        if (eqIdx === -1) return '> error: invalid -F format (expected field=@path)';
        var field = fv.slice(0, eqIdx).trim();
        var filePath = fv.slice(eqIdx + 1).trim();
        if (filePath.startsWith('@')) filePath = filePath.slice(1);
        try {
          var fileContent = await ctx.fs.readFile(filePath);
          var blob = new Blob([fileContent], { type: 'application/octet-stream' });
          formData.append(field, blob, filePath.split('/').pop());
        } catch (e) {
          return '> error: file not found: ' + filePath;
        }
      }
      fetchBody = formData;
      isJson = false;
    }

    // Build fetch options
    var fetchOpts = { method: method, headers: Object.assign({}, headers) };

    if (fetchBody !== null) {
      fetchOpts.body = isJson ? JSON.stringify(fetchBody) : fetchBody;
    }

    // Timeout via AbortController
    var controller = new AbortController();
    fetchOpts.signal = controller.signal;
    var timeoutId = setTimeout(function () { controller.abort(); }, timeout * 1000);

    // Verbose
    var output = '';
    if (verbose) {
      output += '> === Request ===\n';
      output += '> ' + method + ' ' + url + '\n';
      output += '> Headers: ' + JSON.stringify(headers) + '\n';
      if (body) output += '> Body: ' + body + '\n';
      if (queryStr) output += '> Query: ' + queryStr + '\n';
      if (tokfile) output += '> Tokfile: ' + tokfile + '\n';
      output += '> ================\n';
    }

    try {
      var res = await fetch(url, fetchOpts);
      clearTimeout(timeoutId);

      output += '> Status: ' + res.status + ' ' + res.statusText + '\n';

      var text = await res.text();
      var preview;
      try {
        preview = JSON.stringify(JSON.parse(text), null, 2);
      } catch (e) {
        preview = text;
      }

      if (outputPath) {
        await ctx.fs.writeFile(outputPath, preview);
        output += '> Response saved to ' + ctx.fs.normalizePath(outputPath);
      } else {
        output += '> ' + preview.split('\n').join('\n> ');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        output += '> error: request timed out after ' + timeout + 's';
      } else {
        output += '> error: ' + err.message;
      }
    }

    return output.trimEnd();
  }, HELP, 'pkg');

  G.addToConsole('> \ud83d\udd0c apic package loaded. Try: apic <url> -g');
})();
