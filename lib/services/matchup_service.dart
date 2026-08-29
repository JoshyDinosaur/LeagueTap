import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/feed_models.dart';
import '../models/matchup_models.dart';
import '../models/sleeper_models.dart';
import 'sleeper_service.dart';

/// Resolves the user's upcoming fantasy matchup from Sleeper and labels the
/// lineups via the players-info Edge Function.
class MatchupService {
  final SleeperService _sleeper;
  MatchupService({SleeperService? sleeper})
      : _sleeper = sleeper ?? SleeperService();

  Future<MatchupContext> load({
    required String leagueId,
    required String userId,
  }) async {
    final state = await _sleeper.getNflState();
    final week = state.week > 0 ? state.week : 1;

    final rosters = await _sleeper.getRosters(leagueId);
    final users = await _sleeper.getLeagueUsers(leagueId);
    final userById = {for (final u in users) u.userId: u};

    SleeperRoster? mine;
    for (final r in rosters) {
      if (r.ownerId == userId) {
        mine = r;
        break;
      }
    }
    mine ??= rosters.isNotEmpty ? rosters.first : null;

    final matchups = await _sleeper.getMatchups(leagueId, week);

    SleeperRoster? oppRoster;
    if (mine != null && matchups.isNotEmpty) {
      SleeperMatchupEntry? myEntry;
      for (final m in matchups) {
        if (m.rosterId == mine.rosterId) {
          myEntry = m;
          break;
        }
      }
      if (myEntry?.matchupId != null) {
        for (final m in matchups) {
          if (m.matchupId == myEntry!.matchupId && m.rosterId != mine.rosterId) {
            for (final r in rosters) {
              if (r.rosterId == m.rosterId) oppRoster = r;
            }
          }
        }
      }
    }

    // Resolve all starter names in one call.
    final allIds = <String>{
      ...?mine?.starters,
      ...?oppRoster?.starters,
    }.toList();
    final nameMap = await _resolvePlayers(allIds);

    List<MyPlayer> lineup(List<String> ids) =>
        ids.map((id) => nameMap[id]).whereType<MyPlayer>().toList();

    String teamName(SleeperRoster? r) {
      if (r?.ownerId == null) return 'Team';
      return userById[r!.ownerId]?.name ?? 'Team';
    }

    final me = TeamSide(
      name: mine != null ? teamName(mine) : 'Your team',
      record: mine?.record ?? '0-0',
      starters: lineup(mine?.starters ?? const []),
    );

    final opponent = oppRoster == null
        ? null
        : TeamSide(
            name: teamName(oppRoster),
            record: oppRoster.record,
            starters: lineup(oppRoster.starters),
          );

    return MatchupContext(
      week: week,
      seasonType: state.seasonType,
      hasMatchup: opponent != null,
      me: me,
      opponent: opponent,
    );
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
