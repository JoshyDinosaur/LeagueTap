import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

import '../theme.dart';
import 'feed_screen.dart';
import 'gameplan_screen.dart';
import 'league_home_screen.dart';

/// Top-level shell: shared header + the Front Office home page + bottom nav.
class HomeShell extends StatelessWidget {
  final String leagueName;
  final String leagueId;
  final String userId;
  final String? teamName;
  final List<String> playerIds;
  final List<String> starterIds;
  final List<String> leaguePlayerIds;

  const HomeShell({
    super.key,
    required this.leagueName,
    required this.leagueId,
    required this.userId,
    this.teamName,
    required this.playerIds,
    this.starterIds = const [],
    this.leaguePlayerIds = const [],
  });

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        backgroundColor: LT.bg,
        // Mobile app keeps the bottom nav; the web build (LeagueTap.com) drops it.
        bottomNavigationBar: kIsWeb ? null : const _BottomNav(),
        body: Container(
          decoration: const BoxDecoration(gradient: LT.bgGradient),
          child: SafeArea(
            bottom: false,
            child: Column(
              children: [
                _header(),
                const TabBar(
                  labelColor: LT.accent,
                  unselectedLabelColor: LT.textDim,
                  indicatorColor: LT.accent,
                  labelPadding: EdgeInsets.symmetric(horizontal: 4),
                  labelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                  unselectedLabelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                  tabs: [
                    Tab(child: FittedBox(fit: BoxFit.scaleDown, child: Text('Front Office'))),
                    Tab(child: FittedBox(fit: BoxFit.scaleDown, child: Text('LeagueTap'))),
                    Tab(child: FittedBox(fit: BoxFit.scaleDown, child: Text('Gameplan'))),
                  ],
                ),
                const Divider(height: 1, color: LT.border),
                Expanded(
                  child: TabBarView(
                    children: [
                      FrontOfficeTab(
                        playerIds: playerIds,
                        starterIds: starterIds,
                        leaguePlayerIds: leaguePlayerIds,
                        leagueId: leagueId,
                        userId: userId,
                        teamName: teamName,
                      ),
                      LeagueHomeTab(leagueId: leagueId),
                      GameplanTab(leagueId: leagueId, userId: userId),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _header() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 12),
      child: SizedBox(
        height: 36,
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Centered league name (inset so it never collides with the icons).
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 56),
              child: Text(leagueName,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.4)),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: LT.surfaceHi,
                  shape: BoxShape.circle,
                  border: Border.all(color: LT.border),
                ),
                child: const Icon(Icons.person, size: 18, color: LT.textDim),
              ),
            ),
            const Align(
              alignment: Alignment.centerRight,
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.search, color: LT.textDim, size: 22),
                SizedBox(width: 16),
                Icon(Icons.notifications_none, color: LT.textDim, size: 22),
              ]),
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomNav extends StatelessWidget {
  const _BottomNav();

  @override
  Widget build(BuildContext context) {
    Widget item(IconData icon, String label, {bool active = false}) {
      final color = active ? LT.accent : LT.textFaint;
      return Expanded(
        child: GestureDetector(
          onTap: active
              ? null
              : () => ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Coming soon')),
                  ),
          behavior: HitTestBehavior.opaque,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: color, size: 22),
              const SizedBox(height: 4),
              Text(label,
                  style: TextStyle(
                      fontSize: 11,
                      color: color,
                      fontWeight: active ? FontWeight.w700 : FontWeight.w500)),
            ],
          ),
        ),
      );
    }

    return Container(
      height: 78,
      decoration: const BoxDecoration(
        color: LT.bg,
        border: Border(top: BorderSide(color: LT.border)),
      ),
      child: SafeArea(
        top: false,
        child: Row(children: [
          item(Icons.article_outlined, 'News', active: true),
          item(Icons.scoreboard_outlined, 'Scores'),
          item(Icons.star_border, 'Favorites'),
          item(Icons.explore_outlined, 'Discover'),
          item(Icons.emoji_events_outlined, 'Leagues'),
        ]),
      ),
    );
  }
}
