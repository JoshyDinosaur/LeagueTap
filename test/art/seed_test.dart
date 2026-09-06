import 'package:flutter_test/flutter_test.dart';
import 'package:leaguetap/art/seed.dart';

void main() {
  group('hash32', () {
    test('is deterministic', () {
      expect(hash32('p:4034|w7'), hash32('p:4034|w7'));
    });

    test('matches the reference FNV-1a value', () {
      // Empty string => the FNV offset basis.
      expect(hash32(''), 0x811c9dc5);
      // "a" => offset ^ 0x61, * prime, masked to 32 bits.
      expect(hash32('a'), 0xe40c292c);
    });

    test('player and week both move the seed', () {
      expect(hash32('p:4034|w7'), isNot(hash32('p:4035|w7')));
      expect(hash32('p:4034|w7'), isNot(hash32('p:4034|w8')));
    });
  });

  group('SeededRandom', () {
    test('same seed replays the same stream', () {
      final a = SeededRandom(12345);
      final b = SeededRandom(12345);
      for (var i = 0; i < 32; i++) {
        expect(a.nextDouble(), b.nextDouble());
      }
    });

    test('stays in range', () {
      final r = SeededRandom(hash32('p:99|w1'));
      for (var i = 0; i < 500; i++) {
        final v = r.nextDouble();
        expect(v, greaterThanOrEqualTo(0.0));
        expect(v, lessThan(1.0));
      }
    });

    test('nextInt(3) covers 0..2 and never overflows', () {
      final r = SeededRandom(7);
      final seen = <int>{};
      for (var i = 0; i < 300; i++) {
        final n = r.nextInt(3);
        expect(n, inInclusiveRange(0, 2));
        seen.add(n);
      }
      expect(seen, containsAll(<int>[0, 1, 2]));
    });
  });

  group('normalizeName', () {
    test('strips punctuation and case so variants share a seed', () {
      expect(normalizeName("Ja'Marr Chase"), 'jamarrchase');
      expect(normalizeName('JaMarr  Chase'), 'jamarrchase');
      expect(normalizeName('A.J. Brown'), 'ajbrown');
    });
  });
}
