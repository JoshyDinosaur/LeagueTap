// Models for the get-feed Edge Function response.

class FeedResult {
  final List<FeedItem> team;
  final List<FeedItem> league;
  FeedResult({required this.team, required this.league});

  factory FeedResult.fromJson(Map<String, dynamic> j) => FeedResult(
        team: ((j['team'] as List?) ?? [])
            .map((e) => FeedItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        league: ((j['league'] as List?) ?? [])
            .map((e) => FeedItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class MyPlayer {
  final String name;
  final String? position;
  final String? team;
  final String? injury; // injury_status (Questionable/Out/IR/…) or null

  MyPlayer({required this.name, this.position, this.team, this.injury});

  factory MyPlayer.fromJson(Map<String, dynamic> j) => MyPlayer(
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
  });

  factory FeedItem.fromJson(Map<String, dynamic> j) => FeedItem(
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
