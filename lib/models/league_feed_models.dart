/// A league team affected by a news item.
class AffectedTeam {
  final String player;
  final String? position;
  final String manager; // fantasy team / manager name

  AffectedTeam({required this.player, this.position, required this.manager});

  factory AffectedTeam.fromJson(Map<String, dynamic> j) => AffectedTeam(
        player: j['player']?.toString() ?? '',
        position: j['position']?.toString(),
        manager: j['manager']?.toString() ?? 'A team',
      );
}

/// One item in the LeagueTap home feed.
class LeagueFeedItem {
  final String id;
  final String source;
  final String url;
  final String headline;
  final String newsType;
  final DateTime? publishedAt;
  final List<AffectedTeam> affected;
  final String? blurb;
  final String? action; // Start/Sit/Add/Drop/Hold/Stash/Trade/Monitor
  final String? severity; // high | medium | low
  final String? reporter; // breaking | beat | social
  final String? reporterName; // display name e.g. "Breaking Desk"

  LeagueFeedItem({
    required this.id,
    required this.source,
    required this.url,
    required this.headline,
    required this.newsType,
    required this.publishedAt,
    required this.affected,
    required this.blurb,
    this.action,
    this.severity,
    this.reporter,
    this.reporterName,
  });

  factory LeagueFeedItem.fromJson(Map<String, dynamic> j) => LeagueFeedItem(
        id: j['id']?.toString() ?? '',
        source: j['source']?.toString() ?? '',
        url: j['url']?.toString() ?? '',
        headline: _unescape(j['headline']?.toString() ?? ''),
        newsType: j['news_type']?.toString() ?? 'general',
        publishedAt: DateTime.tryParse(j['published_at']?.toString() ?? ''),
        affected: ((j['affected'] as List?) ?? [])
            .map((e) => AffectedTeam.fromJson(e as Map<String, dynamic>))
            .toList(),
        blurb: j['blurb']?.toString(),
        action: j['action']?.toString(),
        severity: j['severity']?.toString(),
        reporter: j['reporter']?.toString(),
        reporterName: j['reporter_name']?.toString(),
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
