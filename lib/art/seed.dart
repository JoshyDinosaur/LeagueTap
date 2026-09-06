// Deterministic seed primitives for generative article art.
//
// Ported 1:1 from the HTML sample grid used to sign off on the look, so the
// Flutter render matches those studies exactly. If you change [hash32] or
// [SeededRandom], change the reference too — they must stay byte-compatible.
//
// Everything here is written to be precision-safe on Flutter web, where ints
// are doubles and bitwise ops are 32-bit: all multiplies go through [_imul]
// (16-bit split, so no intermediate exceeds 2^32) and every step is masked
// back to 32 bits.

/// 32-bit integer multiply with wraparound — the equivalent of JS `Math.imul`.
int _imul(int a, int b) {
  final aLo = a & 0xffff;
  final aHi = (a >>> 16) & 0xffff;
  final bLo = b & 0xffff;
  final bHi = (b >>> 16) & 0xffff;
  final lo = aLo * bLo;
  final mid = ((aHi * bLo + aLo * bHi) & 0xffff) << 16;
  return (lo + mid) & 0xffffffff;
}

/// FNV-1a, 32-bit. Turns a seed string (e.g. `"p:4034|w7"`) into a stable
/// unsigned 32-bit value to feed [SeededRandom].
int hash32(String s) {
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    h = _imul(h ^ s.codeUnitAt(i), 0x01000193);
  }
  return h & 0xffffffff;
}

/// mulberry32 — a tiny, fast, well-distributed PRNG. Same seed ⇒ same stream,
/// on every platform.
class SeededRandom {
  int _a;

  SeededRandom(int seed) : _a = seed & 0xffffffff;

  /// Next value in `[0, 1)`.
  double nextDouble() {
    _a = (_a + 0x6d2b79f5) & 0xffffffff;
    var t = _imul(_a ^ (_a >>> 15), 1 | _a);
    t = ((t + _imul(t ^ (t >>> 7), 61 | t)) & 0xffffffff) ^ t;
    t &= 0xffffffff;
    return ((t ^ (t >>> 14)) & 0xffffffff) / 4294967296.0;
  }

  /// Integer in `[0, max)`.
  int nextInt(int max) => (nextDouble() * max).floor();

  /// Double in `[lo, hi)`.
  double range(double lo, double hi) => lo + nextDouble() * (hi - lo);
}

/// Reduce a player's display name to a punctuation-insensitive key, so
/// `"Ja'Marr Chase"` and `"JaMarr Chase"` seed the same art.
String normalizeName(String s) =>
    s.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '');
