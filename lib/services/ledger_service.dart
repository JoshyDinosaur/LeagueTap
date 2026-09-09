import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/ledger_models.dart';
import '../models/tossup_detail_models.dart';

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

  // The page a toss-up card opens into: relevant articles for the two
  // players being compared + the manager's aggregated decision record.
  Future<TossupDetail?> tossupDetail(String ledgerItemId) async {
    final res = await Supabase.instance.client.functions.invoke(
      'get-tossup-detail',
      body: {'ledger_item_id': ledgerItemId},
    );
    final data = res.data;
    if (data is Map && data['ok'] == true) {
      return TossupDetail.fromJson(data.cast<String, dynamic>());
    }
    return null;
  }
}
