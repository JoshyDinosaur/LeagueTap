import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// LeagueTap visual language: a deep NFL-blue "space navy" canvas, premium and
/// modern. The blurb is the hero — everything else recedes so "what this means
/// for your team" pops, now against an emotional gradient rather than flat black.
class LT {
  // Surfaces — deep "space navy" with an NFL-blue lift up top
  static const Color bgTop = Color(0xFF0B2050); // royal/NFL blue (gradient top)
  static const Color bg = Color(0xFF060A18); // deep space navy (gradient bottom)
  static const LinearGradient bgGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [bgTop, bg],
  );
  static const Color surface = Color(0xFF141F44); // cards (lighter navy)
  static const Color surfaceHi = Color(0xFF1C2A55); // raised
  static const Color border = Color(0xFF2B3A6B);

  // Electric-blue glow for framed containers (hero, rail, carousel panel).
  static const List<BoxShadow> glow = [
    BoxShadow(color: Color(0x2636C5F0), blurRadius: 26, spreadRadius: -6),
  ];

  // Text
  static const Color text = Color(0xFFEEF3FB);
  static const Color textDim = Color(0xFF95A2C4); // blue-grey
  static const Color textFaint = Color(0xFF63708F);

  // Brand accent — electric blue/cyan (the "tap")
  static const Color accent = Color(0xFF36C5F0);
  static const Color accentDim = Color(0xFF0C2D52);

  // Impact
  static const Color hot = Color(0xFFFF5C7A);

  // "Dossier" accent — warm brass/parchment, used only in Front Office to
  // give your personal team feed a case-file feel distinct from LeagueTap's
  // editorial navy-and-serif newspaper feel.
  static const Color dossier = Color(0xFFC9A15A);
  static const Color dossierDim = Color(0xFF3A3018);

  // Editorial serif — LeagueTap's masthead + headline voice (newspaper feel).
  static TextStyle serif({
    required double size,
    FontWeight weight = FontWeight.w600,
    double? height,
    Color color = text,
    double letterSpacing = 0,
    FontStyle style = FontStyle.normal,
  }) =>
      GoogleFonts.sourceSerif4(
        fontSize: size,
        fontWeight: weight,
        height: height,
        color: color,
        letterSpacing: letterSpacing,
        fontStyle: style,
      );

  // Typewriter mono — Front Office's dossier/case-file voice for labels.
  static TextStyle mono({
    required double size,
    FontWeight weight = FontWeight.w600,
    Color color = text,
    double letterSpacing = 0.4,
  }) =>
      GoogleFonts.ibmPlexMono(
        fontSize: size,
        fontWeight: weight,
        color: color,
        letterSpacing: letterSpacing,
      );

  // Position chip colors (RB shifted off the accent cyan so chips stay distinct)
  static Color positionColor(String? pos) {
    switch (pos) {
      case 'QB':
        return const Color(0xFFFF7A59);
      case 'RB':
        return const Color(0xFF5C7CFA);
      case 'WR':
        return const Color(0xFF9B7BFF);
      case 'TE':
        return const Color(0xFFFFC24B);
      case 'K':
        return const Color(0xFF7DD3A8);
      case 'DEF':
        return const Color(0xFF9AA7B8);
      default:
        return textDim;
    }
  }

  // NFL team primary colors (colors aren't copyrightable; logos/photos are).
  // Used only to tint category backdrops.
  static const Map<String, int> _teamColors = {
    'ARI': 0xFF97233F, 'ATL': 0xFFA71930, 'BAL': 0xFF241773, 'BUF': 0xFF00338D,
    'CAR': 0xFF0085CA, 'CHI': 0xFF0B162A, 'CIN': 0xFFFB4F14, 'CLE': 0xFF552A12,
    'DAL': 0xFF1B3D6E, 'DEN': 0xFFFB4F14, 'DET': 0xFF0076B6, 'GB': 0xFF203731,
    'HOU': 0xFF03202F, 'IND': 0xFF002C5F, 'JAX': 0xFF006778, 'KC': 0xFFE31837,
    'LAC': 0xFF0080C6, 'LAR': 0xFF003594, 'LV': 0xFF4D4D4D, 'MIA': 0xFF008E97,
    'MIN': 0xFF4F2683, 'NE': 0xFF0A2342, 'NO': 0xFF9F8958, 'NYG': 0xFF0B2265,
    'NYJ': 0xFF125740, 'PHI': 0xFF004C54, 'PIT': 0xFFB9952B, 'SEA': 0xFF0C2340,
    'SF': 0xFFAA0000, 'TB': 0xFFD50A0A, 'TEN': 0xFF4B92DB, 'WAS': 0xFF5A1414,
  };

  static Color teamColor(String? abbr) =>
      Color(_teamColors[abbr] ?? 0xFF2A3340);

  // Public team color palettes, ordered [primary, secondary, tertiary?]. These
  // are the teams' actual published colors (colors aren't copyrightable) and
  // are the ONLY hues the generative thumbnail art uses for a player — no
  // invented accents. Distinct from _teamColors above, which is a single hue
  // hand-tuned to read on the dark UI.
  static const Map<String, List<int>> _teamPalettes = {
    'ARI': [0xFF97233F, 0xFF000000, 0xFFFFB612],
    'ATL': [0xFFA71930, 0xFF000000, 0xFFA5ACAF],
    'BAL': [0xFF241773, 0xFF000000, 0xFF9E7C0C],
    'BUF': [0xFF00338D, 0xFFC60C30],
    'CAR': [0xFF0085CA, 0xFF101820, 0xFFBFC0BF],
    'CHI': [0xFF0B162A, 0xFFC83803],
    'CIN': [0xFFFB4F14, 0xFF000000],
    'CLE': [0xFF311D00, 0xFFFF3C00],
    'DAL': [0xFF003594, 0xFF869397, 0xFF041E42],
    'DEN': [0xFFFB4F14, 0xFF002244],
    'DET': [0xFF0076B6, 0xFFB0B7BC, 0xFF000000],
    'GB': [0xFF203731, 0xFFFFB612],
    'HOU': [0xFF03202F, 0xFFA71930],
    'IND': [0xFF002C5F, 0xFFA2AAAD],
    'JAX': [0xFF006778, 0xFF101820, 0xFFD7A22A],
    'KC': [0xFFE31837, 0xFFFFB81C],
    'LAC': [0xFF0080C6, 0xFFFFC20E, 0xFF002A5E],
    'LAR': [0xFF003594, 0xFFFFA300],
    'LV': [0xFF000000, 0xFFA5ACAF],
    'MIA': [0xFF008E97, 0xFFFC4C02, 0xFF005778],
    'MIN': [0xFF4F2683, 0xFFFFC62F],
    'NE': [0xFF002244, 0xFFC60C30, 0xFFB0B7BC],
    'NO': [0xFFD3BC8D, 0xFF101820],
    'NYG': [0xFF0B2265, 0xFFA71930, 0xFFA5ACAF],
    'NYJ': [0xFF125740, 0xFF000000],
    'PHI': [0xFF004C54, 0xFFA5ACAF, 0xFF000000],
    'PIT': [0xFFFFB612, 0xFF101820],
    'SEA': [0xFF002244, 0xFF69BE28, 0xFFA5ACAF],
    'SF': [0xFFAA0000, 0xFFB3995D],
    'TB': [0xFFD50A0A, 0xFF34302B, 0xFFFF7900],
    'TEN': [0xFF0C2340, 0xFF4B92DB, 0xFFC8102E],
    'WAS': [0xFF5A1414, 0xFFFFB612],
  };

  /// A team's published color palette (primary first), or null when the team
  /// abbreviation is unknown — the art then falls back to a seeded palette.
  static List<Color>? teamPalette(String? abbr) {
    final v = _teamPalettes[abbr];
    return v == null ? null : [for (final c in v) Color(c)];
  }

  static ThemeData theme() {
    final base = ThemeData.dark(useMaterial3: true);
    return base.copyWith(
      scaffoldBackgroundColor: bg,
      colorScheme: base.colorScheme.copyWith(
        primary: accent,
        surface: surface,
        background: bg,
      ),
      textTheme: base.textTheme.apply(
        bodyColor: text,
        displayColor: text,
        fontFamily: 'SF Pro Text',
      ),
    );
  }
}
