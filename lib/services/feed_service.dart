import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/feed_models.dart';

/// Calls the get-feed Edge Function and returns the team + league feeds.
class FeedService {
  Future<FeedResult> getFeed({
    required List<String> playerIds,
    List<String> leaguePlayerIds = const [],
    List<String> starterIds = const [],
    String? leagueId,
    bool offseason = false,
  }) async {
    final res = await Supabase.instance.client.functions.invoke(
      'get-feed',
      body: {
        'player_ids': playerIds,
        'league_player_ids': leaguePlayerIds,
        'starter_ids': starterIds,
        if (leagueId != null) 'league_id': leagueId,
        'offseason': offseason,
      },
    );

    final data = res.data;
    if (data is! Map) return FeedResult(team: const [], league: const []);
    return FeedResult.fromJson(Map<String, dynamic>.from(data));
  }
}
