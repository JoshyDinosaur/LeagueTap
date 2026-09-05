import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/ledger_models.dart';

class LedgerService {
  Future<List<LedgerItem>> get(String leagueId) async {
    final res = await Supabase.instance.client.functions.invoke(
      'get-ledger-feed',
      body: {'league_id': leagueId},
    );
    final data = res.data;
    if (data is Map && data['items'] is List) {
      return (data['items'] as List)
          .whereType<Map>()
          .map((e) => LedgerItem.fromJson(e.cast<String, dynamic>()))
          .toList();
    }
    return const [];
  }
}
