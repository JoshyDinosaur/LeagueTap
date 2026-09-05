import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

import '../theme.dart';
import 'feed_screen.dart';
import 'gameplan_screen.dart';
import 'league_home_screen.dart';
import 'league_switch_screen.dart';

/// Top-level shell: shared header + the Front Office home page + bottom nav.
class HomeShell extends StatelessWidget {
  final String username;
  final String leagueName;
  final String leagueId;
  final String userId;
  final String? teamName;
  final List<String> playerIds;
  final List<String> starterIds;
  final List<String> leaguePlayerIds;

  const HomeShell({
    super.key,
    required this.username,
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
      // LeagueTap.com is meant to be read like a front page — land there.
      // The mobile app still opens on your personal Front Office feed.
      initialIndex: kIsWeb ? 1 : 0,
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
                _header(context),
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

  Widget _header(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 12),
      child: SizedBox(
        height: 36,
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Centered league name (inset so it never collides with the icons).
            // Tappable — opens the league switcher.
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 56),
              child: InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => LeagueSwitchScreen(
                    username: username,
                    userId: userId,
                    currentLeagueId: leagueId,
                  ),
                )),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Flexible(
                      child: Text(leagueName,
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.4)),
                    ),
                    const SizedBox(width: 4),
                    const Icon(Icons.unfold_more, size: 18, color: LT.textFaint),
                  ],
                ),
              ),
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
