import 'package:flutter_test/flutter_test.dart';
import 'package:leaguetap/theme.dart';

// The 32 current NFL team abbreviations as used across the app / Sleeper data.
const _teams = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET',
  'GB', 'HOU', 'IND', 'JAX', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO',
  'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
];

void main() {
  group('LT.teamPalette', () {
    test('covers every team with 2–3 opaque colors', () {
      for (final t in _teams) {
        final p = LT.teamPalette(t);
        expect(p, isNotNull, reason: '$t missing a palette');
        expect(p!.length, inInclusiveRange(2, 3), reason: '$t palette size');
        for (final c in p) {
          expect(c.a, 1.0, reason: '$t has a non-opaque color');
        }
      }
    });

    test('primary differs from secondary', () {
      for (final t in _teams) {
        final p = LT.teamPalette(t)!;
        expect(p[0], isNot(p[1]), reason: '$t primary == secondary');
      }
    });

    test('returns null for an unknown abbreviation', () {
      expect(LT.teamPalette('XXX'), isNull);
      expect(LT.teamPalette(null), isNull);
    });
  });
}
