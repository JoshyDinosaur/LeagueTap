// A single entry from "The Ledger" — a start/sit call The Ledger has
// written up (a blunder, a steal, a multi-week streak, or a toss-up call
// still to be made). Not a real news article, so it doesn't share
// news_items/blurbs' shape.
class LedgerItem {
  final String id;
  final int week;
  final String? managerName;
  final String headline;
  final String text;
  final String category; // blunder | steal | streak | toss_up
  final double? pointsLeftOnBench;

  LedgerItem({
    required this.id,
    required this.week,
    this.managerName,
    required this.headline,
    required this.text,
    required this.category,
    this.pointsLeftOnBench,
  });

  factory LedgerItem.fromJson(Map<String, dynamic> j) => LedgerItem(
        id: j['id']?.toString() ?? '',
        week: (j['week'] as num?)?.toInt() ?? 0,
        managerName: j['manager_name']?.toString(),
        headline: j['headline']?.toString() ?? '',
        text: j['text']?.toString() ?? '',
        category: j['category']?.toString() ?? 'blunder',
        pointsLeftOnBench: (j['points_left_on_bench'] as num?)?.toDouble(),
      );
}
