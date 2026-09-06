import 'package:flutter/material.dart';

import '../art/persona_badge.dart';
import '../art/thumbnail_painter.dart';

/// Photo-free article thumbnail: a deterministic generative pattern seeded from
/// [seedKey] + [week], tinted to [teamAbbr]'s primary color, with an optional
/// reporter-persona badge composited in one corner.
///
/// Fills its parent — drop it in a [SizedBox], an [AspectRatio], or
/// `Positioned.fill`.
class ArticleThumbnail extends StatelessWidget {
  /// Stable per-player key (see `FeedItem.thumbSeedKey`).
  final String seedKey;

  /// NFL week the article is being shown for.
  final int week;

  /// Team abbreviation of the primary player, if known.
  final String? teamAbbr;

  /// Reporter persona (`breaking` / `beat` / `social` / `trends`), or null.
  final String? reporter;

  final bool showBadge;

  /// Forwarded to [ArticleThumbnailPainter.scrim]; turn off where the caller
  /// paints its own darkening layer.
  final bool scrim;

  final Alignment badgeAlignment;
  final BorderRadius borderRadius;

  const ArticleThumbnail({
    super.key,
    required this.seedKey,
    required this.week,
    this.teamAbbr,
    this.reporter,
    this.showBadge = true,
    this.scrim = true,
    this.badgeAlignment = Alignment.bottomRight,
    this.borderRadius = const BorderRadius.all(Radius.circular(6)),
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: borderRadius,
      child: RepaintBoundary(
        child: CustomPaint(
          painter: ArticleThumbnailPainter(
            seedKey: seedKey,
            week: week,
            teamAbbr: teamAbbr,
            scrim: scrim,
          ),
          child: showBadge
              ? LayoutBuilder(
                  builder: (context, c) {
                    final short =
                        c.biggest.shortestSide.isFinite ? c.biggest.shortestSide : 160.0;
                    final s = (short * 0.13).clamp(26.0, 42.0);
                    return Padding(
                      padding: EdgeInsets.all(s * 0.22),
                      child: Align(
                        alignment: badgeAlignment,
                        child: PersonaBadge(reporter: reporter, size: s),
                      ),
                    );
                  },
                )
              : const SizedBox.expand(),
        ),
      ),
    );
  }
}
