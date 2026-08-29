import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/league_feed_models.dart';

/// Calls get-league-feed for the LeagueTap home tab.
class LeagueFeedService {
  Future<List<LeagueFeedItem>> get(String leagueId) async {
    final res = await Supabase.instance.client.functions.invoke(
      'get-league-feed',
      body: {'league_id': leagueId},
    );
    final data = res.data;
    if (data is! Map || data['items'] is! List) return const [];
    return (data['items'] as List)
        .map((e) => LeagueFeedItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
