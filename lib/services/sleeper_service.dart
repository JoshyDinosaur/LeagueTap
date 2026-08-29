import 'dart:convert';
import 'package:http/http.dart' as http;

import '../models/sleeper_models.dart';

/// Thin client for the public Sleeper API.
/// No auth required — all endpoints are read-only and public.
/// Docs: https://docs.sleeper.com/
class SleeperService {
  SleeperService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  static const String _base = 'https://api.sleeper.app/v1';

  Future<dynamic> _get(String path) async {
    final res = await _client.get(Uri.parse('$_base$path'));
    if (res.statusCode != 200) {
      throw SleeperException('GET $path failed (${res.statusCode})');
    }
    if (res.body.isEmpty || res.body == 'null') return null;
    return jsonDecode(res.body);
  }

  /// Current NFL season/week. Use this to fetch the right season's leagues.
  /// GET /state/nfl
  Future<String> getCurrentSeason() async {
    final data = await _get('/state/nfl') as Map<String, dynamic>?;
    return data?['season']?.toString() ?? DateTime.now().year.toString();
  }

  /// Look up a user by their Sleeper username.
  /// GET /user/{username}  -> null if not found.
  Future<SleeperUser?> getUserByUsername(String username) async {
    final data = await _get('/user/${Uri.encodeComponent(username.trim())}');
    if (data == null) return null;
    return SleeperUser.fromJson(data as Map<String, dynamic>);
  }

  /// All NFL leagues for a user in a given season.
  /// GET /user/{user_id}/leagues/nfl/{season}
  Future<List<SleeperLeague>> getLeagues(String userId, String season) async {
    final data = await _get('/user/$userId/leagues/nfl/$season') as List?;
    if (data == null) return const [];
    return data
        .map((e) => SleeperLeague.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// All rosters in a league.
  /// GET /league/{league_id}/rosters
  Future<List<SleeperRoster>> getRosters(String leagueId) async {
    final data = await _get('/league/$leagueId/rosters') as List?;
    if (data == null) return const [];
    return data
        .map((e) => SleeperRoster.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// The roster owned by a specific user within a league.
  Future<SleeperRoster?> getRosterForUser(
    String leagueId,
    String ownerUserId,
  ) async {
    final rosters = await getRosters(leagueId);
    for (final r in rosters) {
      if (r.ownerId == ownerUserId) return r;
    }
    return null;
  }

  /// The full NFL player map (~5MB). Keyed by player_id.
  /// GET /players/nfl
  /// IMPORTANT: heavy call — cache the result for ~24h, never call per-view.
  Future<Map<String, SleeperPlayer>> getAllPlayers() async {
    final data = await _get('/players/nfl') as Map<String, dynamic>?;
    if (data == null) return {};
    final out = <String, SleeperPlayer>{};
    data.forEach((id, value) {
      if (value is Map<String, dynamic>) {
        out[id] = SleeperPlayer.fromJson(id, value);
      }
    });
    return out;
  }

  /// Players being added most (good offseason signal).
  /// GET /players/nfl/trending/add?limit=N -> [{player_id, count}]
  Future<List<String>> getTrendingAdds({int limit = 25}) async {
    final data =
        await _get('/players/nfl/trending/add?limit=$limit') as List?;
    if (data == null) return const [];
    return data
        .map((e) => (e as Map<String, dynamic>)['player_id']?.toString() ?? '')
        .where((id) => id.isNotEmpty)
        .toList();
  }

  /// Convenience: resolve username -> their roster's player_ids in one call.
  /// Returns null if the user or roster can't be found.
  Future<List<String>?> getMyPlayerIds({
    required String username,
    required String leagueId,
  }) async {
    final user = await getUserByUsername(username);
    if (user == null) return null;
    final roster = await getRosterForUser(leagueId, user.userId);
    return roster?.playerIds;
  }

  /// Current NFL season/week/type. GET /state/nfl
  Future<NflState> getNflState() async {
    final data = await _get('/state/nfl') as Map<String, dynamic>?;
    return NflState.fromJson(data ?? const {});
  }

  /// Weekly matchups for a league. GET /league/{id}/matchups/{week}
  Future<List<SleeperMatchupEntry>> getMatchups(
      String leagueId, int week) async {
    final data = await _get('/league/$leagueId/matchups/$week') as List?;
    if (data == null) return const [];
    return data
        .map((e) => SleeperMatchupEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// League members. GET /league/{id}/users
  Future<List<SleeperLeagueUser>> getLeagueUsers(String leagueId) async {
    final data = await _get('/league/$leagueId/users') as List?;
    if (data == null) return const [];
    return data
        .map((e) => SleeperLeagueUser.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  void dispose() => _client.close();
}

class SleeperException implements Exception {
  SleeperException(this.message);
  final String message;
  @override
  String toString() => 'SleeperException: $message';
}
