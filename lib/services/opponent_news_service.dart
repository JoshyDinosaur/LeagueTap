import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/opponent_news_models.dart';

/// Calls get-opponent-news for the Opponent News carousel.
class OpponentNewsService {
  Future<OpponentNews> get({
    required String leagueId,
    required String userId,
  }) async {
    final res = await Supabase.instance.client.functions.invoke(
      'get-opponent-news',
      body: {'league_id': leagueId, 'user_id': userId},
    );
    final data = res.data;
    if (data is! Map) {
      return OpponentNews(
          week: 0, opponentName: null, opponentRecord: null, items: const []);
    }
    return OpponentNews.fromJson(Map<String, dynamic>.from(data));
  }
}
