import 'package:flutter/material.dart';

import '../services/league_session.dart';
import '../services/session_store.dart';
import '../services/sleeper_service.dart';
import '../theme.dart';
import 'home_shell.dart';
import 'onboarding_screen.dart';

/// Splash: oversized "LT" letterforms bleeding off the edges on black — a bold,
/// abstract typographic mark in the Savee/Mobbin style — with a small pulsing
/// "tap" dot in the negative space. Tap to skip.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _intro; // letters settle in
  late final AnimationController _pulse; // center dot
  bool _navigated = false;

  @override
  void initState() {
    super.initState();
    _intro = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2400),
    )..forward();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
    _intro.addStatusListener((s) {
      if (s == AnimationStatus.completed) _go();
    });
  }

  void _go() {
    if (_navigated) return;
    _navigated = true;
    _resume();
  }

  // Try to restore a saved session (skip onboarding); fall back to it on
  // any failure — a stale/expired league, no connection, or first launch.
  Future<void> _resume() async {
    Widget destination = const OnboardingScreen();
    final saved = await SessionStore.load();
    if (saved != null) {
      final sleeper = SleeperService();
      try {
        final loaded = await loadLeagueForUser(
          sleeper: sleeper,
          userId: saved.userId,
          leagueId: saved.leagueId,
          leagueName: saved.leagueName,
        );
        destination = HomeShell(
          username: saved.username,
          leagueName: loaded.leagueName,
          leagueId: loaded.leagueId,
          userId: loaded.userId,
          teamName: loaded.teamName,
          playerIds: loaded.playerIds,
          starterIds: loaded.starterIds,
          leaguePlayerIds: loaded.leaguePlayerIds,
        );
      } catch (_) {
        await SessionStore.clear();
        destination = const OnboardingScreen();
      } finally {
        sleeper.dispose();
      }
    }
    if (!mounted) return;
    Navigator.of(context).pushReplacement(PageRouteBuilder(
      transitionDuration: const Duration(milliseconds: 500),
      pageBuilder: (_, __, ___) => destination,
      transitionsBuilder: (_, anim, __, child) =>
          FadeTransition(opacity: anim, child: child),
    ));
  }

  @override
  void dispose() {
    _intro.dispose();
    _pulse.dispose();
    super.dispose();
  }

  Widget _glyph(String c, double size) => Text(
        c,
        style: TextStyle(
          fontSize: size,
          height: 0.78,
          fontWeight: FontWeight.w900,
          color: Colors.white,
          letterSpacing: -size * 0.05,
        ),
      );

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _go,
      child: Scaffold(
        backgroundColor: LT.bg,
        body: Container(
          decoration: const BoxDecoration(gradient: LT.bgGradient),
          child: LayoutBuilder(
          builder: (context, c) {
            final w = c.maxWidth;
            final h = c.maxHeight;
            final glyphSize = h * 0.96;

            return ClipRect(
              child: AnimatedBuilder(
                animation: Listenable.merge([_intro, _pulse]),
                builder: (context, _) {
                  final t = Curves.easeOutCubic.transform(_intro.value);
                  final settle = 1.0 - t; // 1 -> 0
                  final dot = Curves.easeInOut.transform(_pulse.value);

                  return Stack(
                    children: [
                      // Giant "L" bleeding off the top-left.
                      Positioned(
                        top: -h * 0.13,
                        left: -w * 0.24 - settle * w * 0.12,
                        child: Opacity(
                          opacity: (t * 1.6).clamp(0.0, 1.0),
                          child: _glyph('L', glyphSize),
                        ),
                      ),
                      // Giant "T" bleeding off the bottom-right.
                      Positioned(
                        bottom: -h * 0.13,
                        right: -w * 0.16 - settle * w * 0.12,
                        child: Opacity(
                          opacity: (t * 1.6).clamp(0.0, 1.0),
                          child: _glyph('T', glyphSize),
                        ),
                      ),
                      // The "tap" dot, pulsing in the negative space.
                      Align(
                        alignment: const Alignment(-0.05, 0.0),
                        child: Opacity(
                          opacity: t,
                          child: Transform.scale(
                            scale: 0.85 + dot * 0.4,
                            child: Container(
                              width: 26,
                              height: 26,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: LT.accent,
                                boxShadow: [
                                  BoxShadow(
                                    color: LT.accent.withOpacity(0.45 * dot),
                                    blurRadius: 24 + dot * 16,
                                    spreadRadius: 2,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                      // Discreet wordmark.
                      Positioned(
                        left: 0,
                        right: 0,
                        bottom: 54,
                        child: Opacity(
                          opacity: t,
                          child: const Text.rich(
                            TextSpan(children: [
                              TextSpan(text: 'LEAGUE'),
                              TextSpan(
                                  text: 'TAP',
                                  style: TextStyle(color: LT.accent)),
                            ]),
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 4,
                            ),
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            );
          },
        ),
        ),
      ),
    );
  }
}
