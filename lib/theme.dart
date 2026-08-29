import 'package:flutter/material.dart';

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
