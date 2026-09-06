import 'dart:math';

import 'package:flutter/material.dart';

/// Placeholder reporter-persona badge.
///
/// Each persona is one [PersonaBadgeSpec] — a color plus a simple drawn glyph
/// (mic = The Beat, phone = The Voice, necktie = the Breaking news desk). Real
/// Aseprite badge art is a later step; when it lands, add an `asset` to the
/// spec and branch on it in [PersonaBadge.build]. Nothing else in the app needs
/// to change — every article thumbnail reads its badge from here.
@immutable
class PersonaBadgeSpec {
  /// Matches `news_items.reporter_type` / the get-feed `reporter` field.
  final String key;

  /// Full display name (e.g. "Breaking Desk").
  final String label;

  /// Which placeholder glyph to draw: `tie` | `mic` | `phone` | `trend` |
  /// `wordmark`.
  final String glyph;

  final Color color;

  const PersonaBadgeSpec({
    required this.key,
    required this.label,
    required this.glyph,
    required this.color,
  });
}

/// Persona hues mirror `reporterMeta()` in feed_screen.dart and the `PERSONAS`
/// table in the get-feed Edge Function. `trends` is the planned start/sit
/// persona — wired here so the badge is ready the moment it starts emitting.
const Map<String, PersonaBadgeSpec> kPersonaBadges = {
  'breaking': PersonaBadgeSpec(
    key: 'breaking',
    label: 'Breaking Desk',
    glyph: 'tie',
    color: Color(0xFFFF5C7A),
  ),
  'beat': PersonaBadgeSpec(
    key: 'beat',
    label: 'The Beat',
    glyph: 'mic',
    color: Color(0xFF6CA8FF),
  ),
  'social': PersonaBadgeSpec(
    key: 'social',
    label: 'The Voice',
    glyph: 'phone',
    color: Color(0xFFB98AFF),
  ),
  'trends': PersonaBadgeSpec(
    key: 'trends',
    label: 'Start/Sit Trends',
    glyph: 'trend',
    color: Color(0xFF7DD3A8),
  ),
};

/// Shown when an article has no assigned reporter (it fell below the blurb
/// cutoff in get-feed, so `reporter` is null).
const PersonaBadgeSpec kNeutralBadge = PersonaBadgeSpec(
  key: '_none',
  label: 'LeagueTap',
  glyph: 'wordmark',
  color: Color(0xFF95A2C4),
);

PersonaBadgeSpec personaBadgeSpec(String? reporter) =>
    kPersonaBadges[reporter] ?? kNeutralBadge;

/// A small rounded tile in the persona's color with its glyph. The caller sets
/// [size]; keep it on the smaller side — it's a byline mark, not a focal point.
class PersonaBadge extends StatelessWidget {
  final String? reporter;
  final double size;

  const PersonaBadge({super.key, required this.reporter, this.size = 38});

  @override
  Widget build(BuildContext context) {
    final spec = personaBadgeSpec(reporter);
    const ink = Color(0xFF0B0E1A);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            spec.color,
            Color.alphaBlend(Colors.black.withOpacity(0.22), spec.color),
          ],
        ),
        borderRadius: BorderRadius.circular(size * 0.28),
        border: Border.all(color: Colors.white.withOpacity(0.28)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.4),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      alignment: Alignment.center,
      child: spec.glyph == 'wordmark'
          ? Text(
              'LT',
              style: TextStyle(
                fontSize: size * 0.36,
                fontWeight: FontWeight.w800,
                height: 1,
                letterSpacing: -0.5,
                color: ink,
              ),
            )
          : SizedBox.square(
              dimension: size * 0.62,
              child: CustomPaint(
                painter: _PersonaGlyphPainter(spec.glyph, ink, spec.color),
              ),
            ),
    );
  }
}

/// Draws the placeholder persona glyphs. Deliberately simple silhouettes —
/// they're stand-ins for real art.
class _PersonaGlyphPainter extends CustomPainter {
  final String glyph;
  final Color ink; // dark foreground
  final Color tile; // badge base color, for "cut-out" details

  const _PersonaGlyphPainter(this.glyph, this.ink, this.tile);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.shortestSide;
    final cx = size.width / 2;
    final fill = Paint()
      ..color = ink
      ..isAntiAlias = true;

    switch (glyph) {
      case 'mic': // The Beat
        final headW = s * 0.36, headTop = s * 0.04, headH = s * 0.5;
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(cx - headW / 2, headTop, headW, headH),
            Radius.circular(headW / 2),
          ),
          fill,
        );
        canvas.drawArc(
          Rect.fromCircle(
              center: Offset(cx, headTop + headH * 0.58), radius: s * 0.32),
          pi * 0.12,
          pi * 0.76,
          false,
          Paint()
            ..color = ink
            ..style = PaintingStyle.stroke
            ..strokeWidth = s * 0.09
            ..strokeCap = StrokeCap.round,
        );
        canvas.drawRect(
          Rect.fromLTWH(cx - s * 0.045, headTop + headH * 0.7, s * 0.09, s * 0.22),
          fill,
        );
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(cx - s * 0.2, s * 0.9, s * 0.4, s * 0.09),
            Radius.circular(s * 0.045),
          ),
          fill,
        );
        break;

      case 'phone': // The Voice
        final pw = s * 0.5, ph = s * 0.86;
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(cx - pw / 2, (s - ph) / 2, pw, ph),
            Radius.circular(s * 0.12),
          ),
          fill,
        );
        final cut = Paint()..color = tile;
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(
                cx - s * 0.1, (s - ph) / 2 + s * 0.08, s * 0.2, s * 0.045),
            Radius.circular(s * 0.03),
          ),
          cut,
        );
        canvas.drawCircle(Offset(cx, (s + ph) / 2 - s * 0.09), s * 0.05, cut);
        break;

      case 'tie': // Breaking Desk
        canvas.drawPath(
          Path()
            ..moveTo(cx - s * 0.14, s * 0.06)
            ..lineTo(cx + s * 0.14, s * 0.06)
            ..lineTo(cx + s * 0.1, s * 0.28)
            ..lineTo(cx - s * 0.1, s * 0.28)
            ..close(),
          fill,
        );
        canvas.drawPath(
          Path()
            ..moveTo(cx - s * 0.1, s * 0.3)
            ..lineTo(cx + s * 0.1, s * 0.3)
            ..lineTo(cx + s * 0.19, s * 0.7)
            ..lineTo(cx, s * 0.95)
            ..lineTo(cx - s * 0.19, s * 0.7)
            ..close(),
          fill,
        );
        break;

      case 'trend': // Start/Sit Trends
        final bw = s * 0.16;
        for (var i = 0; i < 3; i++) {
          final bh = s * (0.3 + i * 0.22);
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromLTWH(
                  cx - s * 0.28 + i * (bw + s * 0.06), s * 0.9 - bh, bw, bh),
              Radius.circular(s * 0.03),
            ),
            fill,
          );
        }
        break;
    }
  }

  @override
  bool shouldRepaint(_PersonaGlyphPainter old) =>
      old.glyph != glyph || old.ink != ink || old.tile != tile;
}
