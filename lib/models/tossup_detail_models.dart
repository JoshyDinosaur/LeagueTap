// Response shape for get-tossup-detail -- the page a "toss_up" Ledger card
// opens into: the news relevant to that specific decision, plus the
// manager's aggregated Ledger decision record in this league.

class TossupDetail {
  final TossupSummary tossup;
  final List<TossupArticle> articles;
  final ManagerRecord record;

  TossupDetail({required this.tossup, required this.articles, required this.record});

  factory TossupDetail.fromJson(Map<String, dynamic> j) => TossupDetail(
        tossup: TossupSummary.fromJson((j['tossup'] as Map).cast<String, dynamic>()),
        articles: (j['articles'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => TossupArticle.fromJson(e.cast<String, dynamic>()))
            .toList(),
        record: ManagerRecord.fromJson((j['record'] as Map).cast<String, dynamic>()),
      );
}

class TossupSummary {
  final String id;
  final int week;
  final String? managerName;
  final String headline;
  final String text;
  final String category;

  TossupSummary({
    required this.id,
    required this.week,
    this.managerName,
    required this.headline,
    required this.text,
    required this.category,
  });

  factory TossupSummary.fromJson(Map<String, dynamic> j) => TossupSummary(
        id: j['id']?.toString() ?? '',
        week: (j['week'] as num?)?.toInt() ?? 0,
        managerName: j['manager_name']?.toString(),
        headline: j['headline']?.toString() ?? '',
        text: j['text']?.toString() ?? '',
        category: j['category']?.toString() ?? '',
      );
}

class TossupArticlePlayer {
  final String id;
  final String name;
  final String? position;
  final String? team;

  TossupArticlePlayer({required this.id, required this.name, this.position, this.team});

  factory TossupArticlePlayer.fromJson(Map<String, dynamic> j) => TossupArticlePlayer(
        id: j['id']?.toString() ?? '',
        name: j['name']?.toString() ?? '',
        position: j['position']?.toString(),
        team: j['team']?.toString(),
      );
}

class TossupArticle {
  final String id;
  final String? source;
  final String url;
  final String headline;
  final DateTime? publishedAt;
  final List<TossupArticlePlayer> players;
  final String? blurb;
  final String? action;
  final int? relevance;

  TossupArticle({
    required this.id,
    this.source,
    required this.url,
    required this.headline,
    this.publishedAt,
    required this.players,
    this.blurb,
    this.action,
    this.relevance,
  });

  factory TossupArticle.fromJson(Map<String, dynamic> j) => TossupArticle(
        id: j['id']?.toString() ?? '',
        source: j['source']?.toString(),
        url: j['url']?.toString() ?? '',
        headline: j['headline']?.toString() ?? '',
        publishedAt: DateTime.tryParse(j['published_at']?.toString() ?? ''),
        players: (j['players'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => TossupArticlePlayer.fromJson(e.cast<String, dynamic>()))
            .toList(),
        blurb: j['blurb']?.toString(),
        action: j['action']?.toString(),
        relevance: (j['relevance'] as num?)?.toInt(),
      );
}

class ManagerRecordEntry {
  final int week;
  final String category; // blunder | steal
  final String headline;
  final String text;
  final double? pointsLeftOnBench;

  ManagerRecordEntry({
    required this.week,
    required this.category,
    required this.headline,
    required this.text,
    this.pointsLeftOnBench,
  });

  factory ManagerRecordEntry.fromJson(Map<String, dynamic> j) => ManagerRecordEntry(
        week: (j['week'] as num?)?.toInt() ?? 0,
        category: j['category']?.toString() ?? '',
        headline: j['headline']?.toString() ?? '',
        text: j['text']?.toString() ?? '',
        pointsLeftOnBench: (j['points_left_on_bench'] as num?)?.toDouble(),
      );
}

class ManagerRecord {
  final String? managerName;
  final int weeksTracked;
  final int blunders;
  final int steals;
  final int streaks;
  final String tendency;
  final List<ManagerRecordEntry> recent;

  ManagerRecord({
    this.managerName,
    required this.weeksTracked,
    required this.blunders,
    required this.steals,
    required this.streaks,
    required this.tendency,
    required this.recent,
  });

  factory ManagerRecord.fromJson(Map<String, dynamic> j) => ManagerRecord(
        managerName: j['manager_name']?.toString(),
        weeksTracked: (j['weeks_tracked'] as num?)?.toInt() ?? 0,
        blunders: (j['blunders'] as num?)?.toInt() ?? 0,
        steals: (j['steals'] as num?)?.toInt() ?? 0,
        streaks: (j['streaks'] as num?)?.toInt() ?? 0,
        tendency: j['tendency']?.toString() ?? '',
        recent: (j['recent'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => ManagerRecordEntry.fromJson(e.cast<String, dynamic>()))
            .toList(),
      );
}
