import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/game_context_models.dart';

/// Fetches per-team game context (schedule + weather + difficulty).
class GameContextService {
  Future<Map<String, GameContext>> getByTeams(List<String> teams) async {
    final unique = teams.where((t) => t.isNotEmpty).toSet().toList();
    if (unique.isEmpty) return {};
    final res = await Supabase.instance.client.functions.invoke(
      'game-context',
      body: {'teams': unique},
    );
    final data = res.data;
    final out = <String, GameContext>{};
    if (data is Map && data['teams'] is Map) {
      (data['teams'] as Map).forEach((team, v) {
        if (v is Map) {
          out[team.toString()] =
              GameContext.fromJson(Map<String, dynamic>.from(v));
        }
      });
    }
    return out;
  }
}
