(function () {
  const G = GASH;

  const HELP = `Math Package Commands (all registered under "math"):
  math sin <n>          - Sine (radians)
  math cos <n>          - Cosine (radians)
  math tan <n>          - Tangent (radians)
  math asin <n>         - Arc sine
  math acos <n>         - Arc cosine
  math atan <n>         - Arc tangent
  math log <n> [base]   - Logarithm (default base e)
  math ln <n>           - Natural log
  math sqrt <n>         - Square root
  math cbrt <n>         - Cube root
  math abs <n>          - Absolute value
  math round <n> [dec]  - Round to N decimal places
  math floor <n>        - Floor
  math ceil <n>         - Ceiling
  math min <n1> <n2> .. - Minimum
  math max <n1> <n2> .. - Maximum
  math clamp <n> <lo> <hi> - Clamp value between lo and hi
  math lerp <a> <b> <t> - Linear interpolation
  math factorial <n>    - Factorial
  math fib <n>          - Nth Fibonacci number
  math isPrime <n>      - Check if prime
  math factors <n>      - Prime factorization
  math gcd <a> <b>      - Greatest common divisor
  math lcm <a> <b>      - Least common multiple
  math rand             - Random float [0, 1)
  math randint <lo> <hi> - Random integer
  math deg <n>          - Radians to degrees
  math rad <n>          - Degrees to radians
  math PI               - Print PI
  math E                - Print E
  math help             - Show this help`;

  function factorial(n) {
    if (n < 0) return NaN;
    if (n <= 1) return 1;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }

  function fibonacci(n) {
    if (n <= 0) return 0;
    if (n === 1) return 1;
    let a = 0, b = 1;
    for (let i = 2; i <= n; i++) { let t = a + b; a = b; b = t; }
    return b;
  }

  function isPrime(n) {
    if (n < 2) return false;
    if (n === 2) return true;
    if (n % 2 === 0) return false;
    for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false;
    return true;
  }

  function primeFactors(n) {
    const factors = [];
    for (let i = 2; i * i <= n; i++) {
      while (n % i === 0) { factors.push(i); n /= i; }
    }
    if (n > 1) factors.push(n);
    return factors;
  }

  function gcd(a, b) {
    while (b) { let t = b; b = a % b; a = t; }
    return a;
  }

  function lcm(a, b) {
    return (a * b) / gcd(a, b);
  }

  function roundTo(n, decimals) {
    const f = Math.pow(10, decimals || 0);
    return Math.round(n * f) / f;
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  G.register('math', async function (args, ctx) {
    if (!args.length) return '> usage: math <func> [args...]';

    const sub = args[0].toLowerCase();

    if (sub === 'help') return '> ' + HELP.split('\n').join('\n> ');
    if (sub === 'pi') return '> ' + Math.PI;
    if (sub === 'e') return '> ' + Math.E;

    const nums = args.slice(1).map(Number);
    const hasNum = nums.length > 0 && !nums.some(isNaN);

    if (!hasNum && sub !== 'rand') return '> error: expected numeric arguments';

    let result;
    switch (sub) {
      case 'sin': result = Math.sin(nums[0]); break;
      case 'cos': result = Math.cos(nums[0]); break;
      case 'tan': result = Math.tan(nums[0]); break;
      case 'asin': result = Math.asin(nums[0]); break;
      case 'acos': result = Math.acos(nums[0]); break;
      case 'atan': result = Math.atan(nums[0]); break;
      case 'log': result = nums.length > 1 ? Math.log(nums[0]) / Math.log(nums[1]) : Math.log10(nums[0]); break;
      case 'ln': result = Math.log(nums[0]); break;
      case 'sqrt': result = Math.sqrt(nums[0]); break;
      case 'cbrt': result = Math.cbrt(nums[0]); break;
      case 'abs': result = Math.abs(nums[0]); break;
      case 'round': result = roundTo(nums[0], nums[1] || 0); break;
      case 'floor': result = Math.floor(nums[0]); break;
      case 'ceil': result = Math.ceil(nums[0]); break;
      case 'min': result = Math.min(...nums); break;
      case 'max': result = Math.max(...nums); break;
      case 'clamp': result = clamp(nums[0], nums[1], nums[2]); break;
      case 'lerp': result = lerp(nums[0], nums[1], nums[2]); break;
      case 'factorial': result = factorial(nums[0]); break;
      case 'fib': result = fibonacci(nums[0]); break;
      case 'isprime': result = isPrime(nums[0]); break;
      case 'factors': result = primeFactors(nums[0]).join(', '); break;
      case 'gcd': result = gcd(nums[0], nums[1]); break;
      case 'lcm': result = lcm(nums[0], nums[1]); break;
      case 'rand': result = Math.random(); break;
      case 'randint': result = Math.floor(Math.random() * (nums[1] - nums[0] + 1)) + nums[0]; break;
      case 'deg': result = nums[0] * (180 / Math.PI); break;
      case 'rad': result = nums[0] * (Math.PI / 180); break;
      default: return `> unknown function: ${sub}`;
    }
    return '> ' + (typeof result === 'number' ? String(result) : result);
  }, HELP, 'pkg');

  G.addToConsole('> \ud83d\udcd6 math package loaded. Try: math help');
})();
