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
      // Always land on the LeagueTap tab on a fresh app launch (cold start).
      // This only sets the tab once, at initial build -- backgrounding and
      // returning to an already-running app keeps whatever tab the user was
      // last on (e.g. Front Office), since that doesn't rebuild this widget.
      initialIndex: 1,
      child: Scaffold(
        backgroundColor: LT.bg,
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
                          // Same editorial serif as the LeagueTap masthead,
                          // so the league picker reads like part of the same
                          // newspaper-style brand voice.
                          style: LT.serif(
                              size: 19,
                              weight: FontWeight.w800,
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
          ],
        ),
      ),
    );
  }
}
