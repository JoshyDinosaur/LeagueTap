// Models for the get-feed Edge Function response.

class FeedResult {
  final List<FeedItem> team;
  final List<FeedItem> league;

  /// NFL week the feed was built for (from Sleeper's state, or an override).
  /// get-feed returns this at the top level; each [FeedItem] is stamped with it
  /// so thumbnails can seed on player + week.
  final int week;
  final String? season;

  FeedResult({
    required this.team,
    required this.league,
    this.week = 0,
    this.season,
  });

  factory FeedResult.fromJson(Map<String, dynamic> j) {
    final week = (j['week'] as num?)?.toInt() ?? 0;
    return FeedResult(
      week: week,
      season: j['season']?.toString(),
      team: ((j['team'] as List?) ?? [])
          .map((e) => FeedItem.fromJson(e as Map<String, dynamic>, week: week))
          .toList(),
      league: ((j['league'] as List?) ?? [])
          .map((e) => FeedItem.fromJson(e as Map<String, dynamic>, week: week))
          .toList(),
    );
  }
}

class MyPlayer {
  final String? id; // Sleeper player id — stable seed key for thumbnail art
  final String name;
  final String? position;
  final String? team;
  final String? injury; // injury_status (Questionable/Out/IR/…) or null

  MyPlayer({this.id, required this.name, this.position, this.team, this.injury});

  factory MyPlayer.fromJson(Map<String, dynamic> j) => MyPlayer(
        id: j['id']?.toString(),
        name: j['name']?.toString() ?? '',
        position: j['position']?.toString(),
        team: j['team']?.toString(),
        injury: j['injury']?.toString(),
      );
}

class FeedItem {
  final String id;
  final String source;
  final String url;
  final String headline;
  final DateTime? publishedAt;
  final num impactScore;
  final List<MyPlayer> myPlayers;
  final String? blurb;
  final String newsType;
  final String? action; // Start/Sit/Add/Drop/Hold/Stash/Buy Low/…
  final String? severity; // high | medium | low
  final String? confidence; // high | medium | low
  final String? timeframe; // now | this_week | rest_of_season | dynasty
  final int? relevance; // 0–100 signal score
  final String? reasoning; // short "why"
  final List<String> tags;
  final String? reporter; // breaking | beat | social
  final String? reporterName; // display name e.g. "Breaking Desk"
  final int week; // stamped from the feed response; seeds thumbnail art

  FeedItem({
    required this.id,
    required this.source,
    required this.url,
    required this.headline,
    required this.publishedAt,
    required this.impactScore,
    required this.myPlayers,
    required this.blurb,
    required this.newsType,
    this.action,
    this.severity,
    this.confidence,
    this.timeframe,
    this.relevance,
    this.reasoning,
    this.tags = const [],
    this.reporter,
    this.reporterName,
    this.week = 0,
  });

  /// Deterministic seed for this article's generative thumbnail. Keys on the
  /// primary rostered player (Sleeper id where available, else a normalized
  /// name), so a player's art stays recognizable week to week; falls back to
  /// the news id when no roster player is attached.
  String get thumbSeedKey {
    final p = myPlayers.isNotEmpty ? myPlayers.first : null;
    final pid = p?.id;
    if (pid != null && pid.isNotEmpty) return 'p:$pid';
    final name = p?.name ?? '';
    if (name.isNotEmpty) {
      return 'n:${name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '')}';
    }
    return 'a:$id';
  }

  factory FeedItem.fromJson(Map<String, dynamic> j, {int week = 0}) => FeedItem(
        week: week,
        id: j['id']?.toString() ?? '',
        source: j['source']?.toString() ?? '',
        url: j['url']?.toString() ?? '',
        headline: _unescape(j['headline']?.toString() ?? ''),
        publishedAt: DateTime.tryParse(j['published_at']?.toString() ?? ''),
        impactScore: (j['impact_score'] as num?) ?? 0,
        myPlayers: ((j['my_players'] as List?) ?? [])
            .map((e) => MyPlayer.fromJson(e as Map<String, dynamic>))
            .toList(),
        blurb: j['blurb']?.toString(),
        newsType: j['news_type']?.toString() ?? 'general',
        action: j['action']?.toString(),
        severity: j['severity']?.toString(),
        confidence: j['confidence']?.toString(),
        timeframe: j['timeframe']?.toString(),
        relevance: (j['relevance'] as num?)?.toInt(),
        reasoning: j['reasoning']?.toString(),
        tags: ((j['tags'] as List?) ?? [])
            .map((e) => e.toString())
            .toList(),
        reporter: j['reporter']?.toString(),
        reporterName: j['reporter_name']?.toString(),
      );

  // Feeds arrive with HTML entities in titles; clean the common ones.
  static String _unescape(String s) => s
      .replaceAll('&#8212;', '—')
      .replaceAll('&#8217;', '’')
      .replaceAll('&#039;', '\'')
      .replaceAll('&amp;', '&')
      .replaceAll('&quot;', '"')
      .replaceAll('&#8220;', '“')
      .replaceAll('&#8221;', '”');
}
