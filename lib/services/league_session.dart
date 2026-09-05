// Shared logic for turning (user, league) into everything HomeShell needs.
// Used by onboarding (first pick), the league switcher, and cold-start
// restore from a saved session — one place so the three stay in sync.

import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import 'sleeper_service.dart';

class LoadedLeague {
  final String leagueId;
  final String leagueName;
  final String userId;
  final String? teamName;
  final List<String> playerIds;
  final List<String> starterIds;
  final List<String> leaguePlayerIds;

  LoadedLeague({
    required this.leagueId,
    required this.leagueName,
    required this.userId,
    this.teamName,
    required this.playerIds,
    this.starterIds = const [],
    this.leaguePlayerIds = const [],
  });
}

/// Fetches rosters + managers for [leagueId] and assembles everything
/// HomeShell needs for [userId]. Throws on network failure — callers decide
/// how to handle that (show an error, fall back to onboarding, etc).
Future<LoadedLeague> loadLeagueForUser({
  required SleeperService sleeper,
  required String userId,
  required String leagueId,
  required String leagueName,
}) async {
  final rosters = await sleeper.getRosters(leagueId);
  final mine = rosters.where((r) => r.ownerId == userId).toList();
  final myIds = mine.isNotEmpty ? mine.first.playerIds : const <String>[];
  final myStarters = mine.isNotEmpty ? mine.first.starters : const <String>[];
  final leaguePlayerIds = rosters.expand((r) => r.playerIds).toSet().toList();

  String? teamName;
  try {
    final users = await sleeper.getLeagueUsers(leagueId);
    final me = users.where((u) => u.userId == userId).toList();
    teamName = me.isNotEmpty ? me.first.name : null;
  } catch (_) {
    teamName = null;
  }

  // Fire-and-forget: tell the backend this league is actively in use, so
  // cron jobs (snapshot-lineups, ledger-report, ledger-tossup, prewarm-feeds)
  // pick it up on their next run instead of only ever knowing about one
  // hardcoded league. Never blocks or fails this call -- a dropped ping just
  // means the next successful load of any league catches it up.
  unawaited(_trackLeague(leagueId, leagueName));

  return LoadedLeague(
    leagueId: leagueId,
    leagueName: leagueName,
    userId: userId,
    teamName: teamName,
    playerIds: myIds,
    starterIds: myStarters,
    leaguePlayerIds: leaguePlayerIds,
  );
}

Future<void> _trackLeague(String leagueId, String leagueName) async {
  try {
    await Supabase.instance.client.functions.invoke(
      'track-league',
      body: {'league_id': leagueId, 'league_name': leagueName},
    );
  } catch (_) {
    // Best-effort -- the app must never fail to load a league over this.
  }
}
