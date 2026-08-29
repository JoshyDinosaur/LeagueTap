// Models for the get-opponent-news Edge Function response.

class OppPlayer {
  final String name;
  final String? position;
  final String? team;
  final String? injury;
  OppPlayer({required this.name, this.position, this.team, this.injury});

  factory OppPlayer.fromJson(Map<String, dynamic> j) => OppPlayer(
        name: j['name']?.toString() ?? '',
        position: j['position']?.toString(),
        team: j['team']?.toString(),
        injury: j['injury']?.toString(),
      );
}

class OppGame {
  final String? opponent;
  final String? homeAway;
  final String? difficulty; // tough | medium | easy
  final String? weather; // label
  final bool bye;
  OppGame({this.opponent, this.homeAway, this.difficulty, this.weather, this.bye = false});

  factory OppGame.fromJson(Map<String, dynamic> j) => OppGame(
        opponent: j['opponent']?.toString(),
        homeAway: j['home_away']?.toString(),
        difficulty: j['difficulty']?.toString(),
        weather: j['weather']?.toString(),
        bye: j['bye'] == true,
      );
}

class OpponentNewsItem {
  final String id;
  final String url;
  final String headline;
  final String newsType;
  final DateTime? publishedAt;
  final String? reporter;
  final String? reporterName;
  final List<OppPlayer> players;
  final OppGame? game;

  OpponentNewsItem({
    required this.id,
    required this.url,
    required this.headline,
    required this.newsType,
    required this.publishedAt,
    required this.reporter,
    required this.reporterName,
    required this.players,
    required this.game,
  });

  factory OpponentNewsItem.fromJson(Map<String, dynamic> j) => OpponentNewsItem(
        id: j['id']?.toString() ?? '',
        url: j['url']?.toString() ?? '',
        headline: _unescape(j['headline']?.toString() ?? ''),
        newsType: j['news_type']?.toString() ?? 'general',
        publishedAt: DateTime.tryParse(j['published_at']?.toString() ?? ''),
        reporter: j['reporter']?.toString(),
        reporterName: j['reporter_name']?.toString(),
        players: ((j['players'] as List?) ?? [])
            .map((e) => OppPlayer.fromJson(e as Map<String, dynamic>))
            .toList(),
        game: j['game'] is Map
            ? OppGame.fromJson(Map<String, dynamic>.from(j['game'] as Map))
            : null,
      );

  static String _unescape(String s) => s
      .replaceAll('&#8212;', '—')
      .replaceAll('&#8217;', '’')
      .replaceAll('&#039;', '\'')
      .replaceAll('&amp;', '&')
      .replaceAll('&quot;', '"')
      .replaceAll('&#8220;', '“')
      .replaceAll('&#8221;', '”');
}

class OpponentNews {
  final int week;
  final String? opponentName;
  final String? opponentRecord;
  final List<OpponentNewsItem> items;
  OpponentNews({
    required this.week,
    required this.opponentName,
    required this.opponentRecord,
    required this.items,
  });

  factory OpponentNews.fromJson(Map<String, dynamic> j) {
    final opp = j['opponent'];
    return OpponentNews(
      week: (j['week'] as num?)?.toInt() ?? 0,
      opponentName: opp is Map ? opp['name']?.toString() : null,
      opponentRecord: opp is Map ? opp['record']?.toString() : null,
      items: ((j['items'] as List?) ?? [])
          .map((e) => OpponentNewsItem.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
