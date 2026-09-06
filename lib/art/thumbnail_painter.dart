import 'dart:math';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../theme.dart';
import 'seed.dart';

/// Photo-free generative article art.
///
/// The seed is **player + week**: [seedKey] identifies the player, so a player
/// keeps one shape family and palette anchor across all their stories, while
/// [week] re-cuts every parameter so no two of their articles look alike.
/// [teamAbbr]'s primary color drives the palette (colors aren't copyrightable;
/// logos and photos are); with no team we fall back to a hue derived from the
/// player seed.
///
/// This is a direct port of the signed-off HTML sample grid — same hash, same
/// PRNG, same math — so treat changes here as changes to that reference.
class ArticleThumbnailPainter extends CustomPainter {
  final String seedKey;
  final int week;
  final String? teamAbbr;

  /// Paint the bottom-up darkening scrim that keeps overlaid text legible.
  /// Turn off where the caller draws its own (e.g. the feed hero).
  final bool scrim;

  ArticleThumbnailPainter({
    required this.seedKey,
    required this.week,
    this.teamAbbr,
    this.scrim = true,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final idSeed = hash32(seedKey);
    final wkSeed = hash32('$seedKey|w$week');
    final rid = SeededRandom(idSeed); // stable per player
    final rwk = SeededRandom(wkSeed); // varies per week

    // ---- palette ----
    final int? teamValue = LT.teamColorValue(teamAbbr);
    final HSLColor base = teamValue != null
        ? HSLColor.fromColor(Color(teamValue))
        : HSLColor.fromAHSL(1, rid.nextDouble() * 360, 0.52, 0.44);

    final idPick = rid.nextInt(3);
    final accentH = base.hue + 150 + idPick * 40 + (rwk.nextDouble() * 26 - 13);
    final gradAngle = rwk.nextDouble() * 2 * pi;
    final mode = idSeed % 5;

    Color hsla(double h, double s, double l, [double a = 1]) => HSLColor.fromAHSL(
          a,
          h % 360,
          s.clamp(0.0, 1.0),
          l.clamp(0.0, 1.0),
        ).toColor();

    final cDeep = hsla(base.hue, min(base.saturation, 0.60), 0.09);
    final cBase =
        hsla(base.hue, min(base.saturation * 0.95, 0.70), min(base.lightness, 0.40));
    Color cAcc(double a) => hsla(accentH, 0.58, 0.60, a);
    Color cInk(double a) => Colors.white.withOpacity(a);

    final w = size.width, h = size.height;
    final r = sqrt(w * w + h * h);
    final cx = w / 2, cy = h / 2;

    // ---- 1. background gradient: team color → deep navy, weekly angle ----
    final gx = cos(gradAngle) * r * 0.5, gy = sin(gradAngle) * r * 0.5;
    canvas.drawRect(
      Offset.zero & size,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(cx - gx, cy - gy),
          Offset(cx + gx, cy + gy),
          [cBase, hsla(base.hue, base.saturation * 0.7, 0.13), cDeep],
          [0.0, 0.55, 1.0],
        ),
    );

    // ---- 2. oversized faint motif, anchored per player ----
    final anchorX = w * (0.24 + rid.nextDouble() * 0.52);
    final anchorY = h * (0.20 + rid.nextDouble() * 0.60);
    final motif = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = cInk(0.06);
    canvas.save();
    canvas.translate(anchorX, anchorY);
    for (var i = 5; i >= 1; i--) {
      canvas.drawCircle(Offset.zero, r * 0.62 * (i / 5), motif);
    }
    canvas.restore();

    // ---- 3. shape family (stable per player), parameters weekly ----
    canvas.save();
    canvas.translate(anchorX, anchorY);
    canvas.rotate(rwk.nextDouble() * 2 * pi);
    switch (mode) {
      case 0:
        _arcs(canvas, r, rwk, cAcc, cInk);
        break;
      case 1:
        _chevrons(canvas, r, rwk, cAcc, cInk);
        break;
      case 2:
        _bands(canvas, r, rwk, cAcc, cInk);
        break;
      case 3:
        _dots(canvas, r, rwk, cAcc, cInk);
        break;
      default:
        _packed(canvas, r, rwk, cAcc, cInk);
    }
    canvas.restore();

    // ---- 4. grain (deterministic) ----
    final grain = SeededRandom(wkSeed ^ 0x9e3779b9);
    final count = (w * h / 90).round();
    final light = <Offset>[];
    final dark = <Offset>[];
    for (var i = 0; i < count; i++) {
      final o = Offset(grain.nextDouble() * w, grain.nextDouble() * h);
      (grain.nextDouble() > 0.5 ? light : dark).add(o);
    }
    canvas.drawPoints(ui.PointMode.points, light,
        Paint()..strokeWidth = 1..color = Colors.white.withOpacity(0.035));
    canvas.drawPoints(ui.PointMode.points, dark,
        Paint()..strokeWidth = 1..color = Colors.black.withOpacity(0.035));

    // ---- 5. bottom scrim (headline legibility in the real card) ----
    if (scrim) {
      canvas.drawRect(
        Offset.zero & size,
        Paint()
          ..shader = ui.Gradient.linear(
            Offset(0, h * 0.45),
            Offset(0, h),
            const [Color(0x00060A18), Color(0x9E060A18)],
          ),
      );
    }
  }

  // --- shape families -------------------------------------------------------
  // Each takes the diagonal `r` and the weekly PRNG; the canvas is already
  // translated to the player anchor and rotated by a weekly angle.

  void _arcs(Canvas c, double r, SeededRandom rwk, Color Function(double) acc,
      Color Function(double) ink) {
    final rings = 4 + rwk.nextInt(5);
    for (var i = 0; i < rings; i++) {
      final rr = r * 0.5 * ((i + 1) / rings);
      final a0 = rwk.nextDouble() * 2 * pi;
      c.drawArc(
        Rect.fromCircle(center: Offset.zero, radius: rr),
        a0,
        pi * (0.7 + rwk.nextDouble() * 1.1),
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1 + i * 0.9
          ..color = i.isOdd ? acc(0.5) : ink(0.16),
      );
    }
  }

  void _chevrons(Canvas c, double r, SeededRandom rwk, Color Function(double) acc,
      Color Function(double) ink) {
    final n = 3 + rwk.nextInt(4);
    final step = (r * 0.34) / n;
    final p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..strokeWidth = 3 + rwk.nextDouble() * 6;
    for (var i = 0; i < n; i++) {
      p.color = i.isOdd ? acc(0.55) : ink(0.2);
      final off = i * step - (n * step) / 2;
      final s = r * 0.22;
      c.drawPath(
        Path()
          ..moveTo(-s, off + s * 0.7)
          ..lineTo(0, off - s * 0.4)
          ..lineTo(s, off + s * 0.7),
        p,
      );
    }
  }

  void _bands(Canvas c, double r, SeededRandom rwk, Color Function(double) acc,
      Color Function(double) ink) {
    final n = 4 + rwk.nextInt(4);
    final gap = (r * 0.5) / n;
    for (var i = 0; i < n; i++) {
      final y = i * gap - (n * gap) / 2 + rwk.nextDouble() * 6;
      final bh = gap * (0.35 + rwk.nextDouble() * 0.4);
      c.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(-r * 0.55, y, r * 1.1, bh),
          Radius.circular(bh / 2),
        ),
        Paint()
          ..color = i % 3 == 0 ? acc(0.4) : ink(0.07 + (i.isOdd ? 0.05 : 0.0)),
      );
    }
  }

  void _dots(Canvas c, double r, SeededRandom rwk, Color Function(double) acc,
      Color Function(double) ink) {
    final cols = 5 + rwk.nextInt(4);
    final rows = 4 + rwk.nextInt(3);
    final sx = (r * 0.7) / cols, sy = (r * 0.5) / rows;
    final dir = rwk.nextDouble() > 0.5 ? 1.0 : -1.0;
    for (var a = 0; a < cols; a++) {
      for (var b = 0; b < rows; b++) {
        final t = (a / cols) * dir + (b / rows) * (1 - dir * 0.5);
        final rad = max(0.6, sx * 0.42 * (0.3 + t.abs()));
        c.drawCircle(
          Offset(a * sx - (cols * sx) / 2, b * sy - (rows * sy) / 2),
          rad,
          Paint()..color = (a + b) % 4 == 0 ? acc(0.7) : ink(0.14),
        );
      }
    }
  }

  void _packed(Canvas c, double r, SeededRandom rwk, Color Function(double) acc,
      Color Function(double) ink) {
    final n = 6 + rwk.nextInt(7);
    for (var i = 0; i < n; i++) {
      final rr = r * (0.05 + rwk.nextDouble() * 0.2);
      final px = (rwk.nextDouble() - 0.5) * r * 0.8;
      final py = (rwk.nextDouble() - 0.5) * r * 0.6;
      if (i % 3 == 0) {
        c.drawCircle(
          Offset(px, py),
          rr,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2
            ..color = ink(0.22),
        );
      } else {
        c.drawCircle(
          Offset(px, py),
          rr,
          Paint()..color = i.isOdd ? acc(0.32) : ink(0.07),
        );
      }
    }
  }

  @override
  bool shouldRepaint(ArticleThumbnailPainter old) =>
      old.seedKey != seedKey ||
      old.week != week ||
      old.teamAbbr != teamAbbr ||
      old.scrim != scrim;
}
