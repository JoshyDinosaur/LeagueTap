// League-wide "who's starting" — reuses the same Sleeper matchup data
// MatchupService already pulls for your own team, but for every manager.
// v1 is read-only/live: it shows the current week's starters as Sleeper has
// them right now (locked once games kick off). Grading a lineup as smart or
// dumb after the fact needs per-player weekly scoring, which Sleeper's
// matchup payload carries but we don't parse yet — a natural phase 2 once
// this foundation is in place.

import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/feed_models.dart' show MyPlayer;
import '../models/matchup_models.dart' show TeamSide;
import '../models/sleeper_models.dart';
import 'sleeper_service.dart';

class LeagueLineups {
  final int week;
  final bool locked; // true once Sleeper has published real matchups
  final List<TeamSide> teams; // one per manager

  LeagueLineups({required this.week, required this.locked, required this.teams});
}

class LeagueLineupsService {
  final SleeperService _sleeper;
  LeagueLineupsService({SleeperService? sleeper}) : _sleeper = sleeper ?? SleeperService();

  Future<LeagueLineups> load(String leagueId) async {
    final state = await _sleeper.getNflState();
    final week = state.week > 0 ? state.week : 1;

    final rosters = await _sleeper.getRosters(leagueId);
    final users = await _sleeper.getLeagueUsers(leagueId);
    final userById = {for (final u in users) u.userId: u};
    final matchups = await _sleeper.getMatchups(leagueId, week);

    // Prefer the matchup's starters (this week's official, locked-at-kickoff
    // lineup) but fall back to the roster's live starters early in the
    // preseason/offseason before matchups are published.
    final startersByRoster = {for (final m in matchups) m.rosterId: m.starters};

    final allIds = <String>{};
    for (final r in rosters) {
      allIds.addAll(startersByRoster[r.rosterId] ?? r.starters);
    }
    final nameMap = await _resolvePlayers(allIds.toList());

    List<MyPlayer> lineup(List<String> ids) =>
        ids.map((id) => nameMap[id]).whereType<MyPlayer>().toList();

    String teamName(SleeperRoster r) {
      if (r.ownerId == null) return 'Team';
      return userById[r.ownerId]?.name ?? 'Team';
    }

    final teams = rosters.map((r) {
      final starterIds = startersByRoster[r.rosterId] ?? r.starters;
      return TeamSide(
        name: teamName(r),
        record: r.record,
        starters: lineup(starterIds),
      );
    }).toList();

    return LeagueLineups(week: week, locked: matchups.isNotEmpty, teams: teams);
  }

  Future<Map<String, MyPlayer>> _resolvePlayers(List<String> ids) async {
    if (ids.isEmpty) return {};
    final res = await Supabase.instance.client.functions.invoke(
      'players-info',
      body: {'player_ids': ids},
    );
    final data = res.data;
    final out = <String, MyPlayer>{};
    if (data is Map && data['players'] is Map) {
      (data['players'] as Map).forEach((id, v) {
        if (v is Map) {
          out[id.toString()] = MyPlayer(
            name: v['name']?.toString() ?? '',
            position: v['position']?.toString(),
            team: v['team']?.toString(),
          );
        }
      });
    }
    return out;
  }
}
