import 'package:flutter/material.dart';

/// Placeholder reporter-persona badge.
///
/// Each persona is one [PersonaBadgeSpec] — a color plus a short initial. Real
/// Aseprite badge art is a later step; when it lands, add an `asset` to the
/// spec and branch on it in [PersonaBadge.build]. Nothing else in the app
/// needs to change — every article thumbnail reads its badge from here.
@immutable
class PersonaBadgeSpec {
  /// Matches `news_items.reporter_type` / the get-feed `reporter` field.
  final String key;

  /// Full display name (e.g. "Breaking Desk").
  final String label;

  /// 1–2 characters shown on the placeholder tile.
  final String initial;

  final Color color;

  const PersonaBadgeSpec({
    required this.key,
    required this.label,
    required this.initial,
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
    initial: 'B',
    color: Color(0xFFFF5C7A),
  ),
  'beat': PersonaBadgeSpec(
    key: 'beat',
    label: 'The Beat',
    initial: 'T',
    color: Color(0xFF6CA8FF),
  ),
  'social': PersonaBadgeSpec(
    key: 'social',
    label: 'The Voice',
    initial: 'V',
    color: Color(0xFFB98AFF),
  ),
  'trends': PersonaBadgeSpec(
    key: 'trends',
    label: 'Start/Sit Trends',
    initial: 'S',
    color: Color(0xFF7DD3A8),
  ),
};

/// Shown when an article has no assigned reporter (it fell below the blurb
/// cutoff in get-feed, so `reporter` is null).
const PersonaBadgeSpec kNeutralBadge = PersonaBadgeSpec(
  key: '_none',
  label: 'LeagueTap',
  initial: 'LT',
  color: Color(0xFF95A2C4),
);

PersonaBadgeSpec personaBadgeSpec(String? reporter) =>
    kPersonaBadges[reporter] ?? kNeutralBadge;

/// A small rounded tile in the persona's color with its initial. The caller
/// sets [size]; keep it on the smaller side — it's a byline mark, not a focal
/// point.
class PersonaBadge extends StatelessWidget {
  final String? reporter;
  final double size;

  const PersonaBadge({super.key, required this.reporter, this.size = 38});

  @override
  Widget build(BuildContext context) {
    final spec = personaBadgeSpec(reporter);
    final twoChar = spec.initial.length > 1;
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
      child: Text(
        spec.initial,
        style: TextStyle(
          fontSize: size * (twoChar ? 0.38 : 0.5),
          fontWeight: FontWeight.w800,
          height: 1,
          letterSpacing: twoChar ? -0.5 : 0,
          color: const Color(0xFF0B0E1A),
        ),
      ),
    );
  }
}
