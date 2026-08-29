import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';
import '../models/feed_models.dart';
import '../models/opponent_news_models.dart';
import '../services/feed_service.dart';
import '../services/opponent_news_service.dart';
import '../theme.dart';

String relativeTime(DateTime? t) {
  if (t == null) return '';
  final d = DateTime.now().difference(t);
  if (d.inMinutes < 60) return '${d.inMinutes}m ago';
  if (d.inHours < 24) return '${d.inHours}h ago';
  return '${d.inDays}d ago';
}

Future<void> openItem(String url) async {
  final uri = Uri.tryParse(url);
  if (uri != null) await launchUrl(uri, mode: LaunchMode.externalApplication);
}

class CategoryMeta {
  final IconData icon;
  final String label;
  final Color hue;
  const CategoryMeta(this.icon, this.label, this.hue);
}

CategoryMeta categoryMeta(String type) {
  switch (type) {
    case 'injury':
      return const CategoryMeta(Icons.personal_injury, 'INJURY', LT.hot);
    case 'suspension':
      return const CategoryMeta(Icons.gavel, 'SUSPENSION', Color(0xFFFFB020));
    case 'return':
      return const CategoryMeta(Icons.replay, 'RETURN', Color(0xFF7DD3A8));
    case 'trade':
      return const CategoryMeta(Icons.swap_horiz, 'TRADE', Color(0xFF36C5F0));
    case 'contract':
      return const CategoryMeta(Icons.attach_money, 'CONTRACT', Color(0xFFE0B341));
    case 'draft':
      return const CategoryMeta(Icons.military_tech, 'DRAFT', Color(0xFFB98AFF));
    case 'coaching':
      return const CategoryMeta(Icons.sports, 'COACHING', Color(0xFF6CA8FF));
    case 'signing':
      return const CategoryMeta(Icons.draw, 'SIGNING', LT.accent);
    case 'breakout':
      return const CategoryMeta(Icons.rocket_launch, 'BREAKOUT', Color(0xFFFF8A4C));
    case 'usage':
      return const CategoryMeta(Icons.trending_up, 'USAGE', Color(0xFF9B7BFF));
    case 'camp':
      return const CategoryMeta(Icons.fitness_center, 'CAMP', Color(0xFF8AC6A0));
    case 'ranking':
      return const CategoryMeta(Icons.format_list_numbered, 'RANKINGS', Color(0xFF5BC8C0));
    case 'rumor':
      return const CategoryMeta(Icons.forum, 'RUMOR', Color(0xFFC0A8FF));
    default:
      return const CategoryMeta(Icons.sports_football, 'NEWS', LT.textDim);
  }
}

// Several glyph variants per type; pick one deterministically per item so two
// same-type cards don't show the identical icon.
const Map<String, List<IconData>> _glyphVariants = {
  'injury': [Icons.personal_injury, Icons.healing, Icons.medical_services, Icons.monitor_heart],
  'suspension': [Icons.gavel, Icons.report_gmailerrorred, Icons.block],
  'return': [Icons.replay, Icons.autorenew, Icons.restart_alt, Icons.check_circle_outline],
  'trade': [Icons.swap_horiz, Icons.sync_alt, Icons.compare_arrows],
  'contract': [Icons.attach_money, Icons.description, Icons.edit_document, Icons.handshake],
  'draft': [Icons.military_tech, Icons.stars, Icons.school, Icons.emoji_events],
  'coaching': [Icons.sports, Icons.groups, Icons.account_tree, Icons.assignment],
  'signing': [Icons.draw, Icons.how_to_reg, Icons.person_add_alt, Icons.assignment_turned_in],
  'breakout': [Icons.rocket_launch, Icons.local_fire_department, Icons.bolt, Icons.auto_awesome],
  'usage': [Icons.trending_up, Icons.bar_chart, Icons.leaderboard, Icons.speed],
  'camp': [Icons.fitness_center, Icons.sports_football, Icons.event, Icons.directions_run],
  'ranking': [Icons.format_list_numbered, Icons.insights, Icons.analytics, Icons.leaderboard],
  'rumor': [Icons.forum, Icons.campaign, Icons.help_outline, Icons.bubble_chart],
  'general': [Icons.sports_football, Icons.article, Icons.newspaper, Icons.flag],
};

IconData backdropGlyph(FeedItem item) {
  final list = _glyphVariants[item.newsType] ?? _glyphVariants['general']!;
  final idx = item.id.hashCode.abs() % list.length;
  return list[idx];
}

String? _teamOf(FeedItem i) =>
    i.myPlayers.isNotEmpty ? i.myPlayers.first.team : null;

// Reporter persona presentation (badge label, icon, hue).
class ReporterMeta {
  final String label;
  final IconData icon;
  final Color hue;
  const ReporterMeta(this.label, this.icon, this.hue);
}

ReporterMeta? reporterMeta(FeedItem i) {
  switch (i.reporter) {
    case 'breaking':
      return ReporterMeta(
          i.reporterName ?? 'Breaking Desk', Icons.bolt, LT.hot);
    case 'beat':
      return ReporterMeta(
          i.reporterName ?? 'The Beat', Icons.edit_note, const Color(0xFF6CA8FF));
    case 'social':
      return ReporterMeta(
          i.reporterName ?? 'The Voice', Icons.campaign, const Color(0xFFB98AFF));
    default:
      return null;
  }
}

// A small reporter-persona byline chip.
class _ReporterBadge extends StatelessWidget {
  final FeedItem item;
  final bool onDark;
  const _ReporterBadge({required this.item, this.onDark = false});

  @override
  Widget build(BuildContext context) {
    final m = reporterMeta(item);
    if (m == null) return const SizedBox.shrink();
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(m.icon, size: 13, color: m.hue),
      const SizedBox(width: 4),
      Text(m.label.toUpperCase(),
          style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.6,
              color: onDark ? Colors.white.withOpacity(0.92) : m.hue)),
    ]);
  }
}

// Human-readable timeframe label (e.g. "this_week" -> "THIS WEEK").
String? timeframeLabel(String? t) {
  switch (t) {
    case 'now':
      return 'ACT NOW';
    case 'this_week':
      return 'THIS WEEK';
    case 'rest_of_season':
      return 'REST OF SEASON';
    case 'dynasty':
      return 'DYNASTY';
    default:
      return null;
  }
}

class FrontOfficeTab extends StatefulWidget {
  final List<String> playerIds;
  final List<String> starterIds;
  final List<String> leaguePlayerIds;
  final String? leagueId;
  final String? userId;
  final String? teamName;

  const FrontOfficeTab({
    super.key,
    required this.playerIds,
    this.starterIds = const [],
    this.leaguePlayerIds = const [],
    this.leagueId,
    this.userId,
    this.teamName,
  });

  @override
  State<FrontOfficeTab> createState() => _FrontOfficeTabState();
}

class _FrontOfficeTabState extends State<FrontOfficeTab>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  final _service = FeedService();
  late Future<FeedResult> _future;
  bool _offseason = AppConfig.offseasonModeDefault;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  // League-wide news lives on its own LeagueTap tab (get-league-feed), so we
  // only request the team-scoped get-feed here.
  Future<FeedResult> _load() => _service.getFeed(
        playerIds: widget.playerIds,
        starterIds: widget.starterIds,
        leagueId: widget.leagueId,
        offseason: _offseason,
      );

  // Toggling offseason mode re-fetches (blurbs are framed differently).
  void _setOffseason(bool v) {
    setState(() {
      _offseason = v;
      _future = _load();
    });
  }

  Future<void> _refresh() async {
    final fresh = _load();
    setState(() => _future = fresh);
    await fresh;
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return RefreshIndicator(
      color: LT.accent,
      backgroundColor: LT.surface,
      onRefresh: _refresh,
      child: FutureBuilder<FeedResult>(
        future: _future,
        builder: (context, snap) {
          final loading = snap.connectionState == ConnectionState.waiting;
          final result = snap.data;
          return CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              if (loading)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                      child: CircularProgressIndicator(color: LT.accent)),
                )
              else ...[
                const SliverToBoxAdapter(child: SizedBox(height: 8)),
                ..._teamSlivers(result?.team ?? const []),
                const SliverToBoxAdapter(child: SizedBox(height: 28)),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _emptyTeam() => const Padding(
        padding: EdgeInsets.fromLTRB(20, 40, 20, 24),
        child: Column(children: [
          Text('Quiet week for your roster.',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 17, fontWeight: FontWeight.w700, color: LT.text)),
          SizedBox(height: 6),
          Text('Off-season news ramps up at training camp.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: LT.textDim)),
        ]),
      );

  // NFL.com-style layout. Wide (web): the hero sits left, the "FOR YOUR TEAM"
  // rail on the right. Narrow (mobile): everything stacks full-width.
  List<Widget> _teamSlivers(List<FeedItem> team) {
    final hero = team.isNotEmpty ? team.first : null;
    final rest = team.length > 1 ? team.skip(1).toList() : const <FeedItem>[];

    return [
      SliverToBoxAdapter(
        child: LayoutBuilder(
          builder: (context, c) {
            final wide = c.maxWidth >= 720;
            if (wide) {
              return Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 3,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (hero != null)
                            _Hero(
                                item: hero,
                                padding: EdgeInsets.zero,
                                aspectRatio: 1.5)
                          else
                            _emptyTeam(),
                        ],
                      ),
                    ),
                    if (rest.isNotEmpty) ...[
                      const SizedBox(width: 20),
                      Expanded(
                          flex: 2,
                          child: _TeamNewsPanel(
                            items: rest,
                            teamName: widget.teamName,
                            offseason: _offseason,
                            onToggleOffseason: _setOffseason,
                          )),
                    ],
                  ],
                ),
              );
            }
            return Column(
              children: [
                if (hero != null) _Hero(item: hero, aspectRatio: 1.05) else _emptyTeam(),
                if (rest.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
                    child: _TeamNewsPanel(
                      items: rest,
                      teamName: widget.teamName,
                      offseason: _offseason,
                      onToggleOffseason: _setOffseason,
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    ];
  }
}

// ---------------------------------------------------------------------------
// NFL.com-style section header + horizontal carousel (Opponent News, used by Gameplan)
// ---------------------------------------------------------------------------

// A horizontal carousel with an NFL-style header: title left, "X of N" pager +
// arrows right. Cards are grouped to fill the available width (so the row spans
// only up to its column edge), navigable by arrows AND free swipe/trackpad.
class _Carousel extends StatefulWidget {
  final String title;
  final String? subtitle;
  final int count;
  final Widget Function(BuildContext, int) itemBuilder;
  final double targetCardWidth;
  final double height;
  final double sidePad;
  const _Carousel({
    required this.title,
    this.subtitle,
    required this.count,
    required this.itemBuilder,
    this.targetCardWidth = 240,
    this.height = 250,
    this.sidePad = 20,
  });

  @override
  State<_Carousel> createState() => _CarouselState();
}

class _CarouselState extends State<_Carousel> {
  static const _gap = 12.0;
  final _ctrl = ScrollController();
  int _page = 0;
  int _perPage = 1;
  double _stride = 1;

  @override
  void initState() {
    super.initState();
    _ctrl.addListener(_onScroll);
  }

  void _onScroll() {
    if (_stride <= 0) return;
    final p = (_ctrl.offset / _stride).round();
    if (p != _page) setState(() => _page = p);
  }

  @override
  void dispose() {
    _ctrl.removeListener(_onScroll);
    _ctrl.dispose();
    super.dispose();
  }

  int get _pages => (widget.count / _perPage).ceil().clamp(1, 9999);

  void _go(int dir) {
    final target = (_page + dir).clamp(0, _pages - 1);
    _ctrl.animateTo(target * _stride,
        duration: const Duration(milliseconds: 320), curve: Curves.easeOutCubic);
  }

  @override
  Widget build(BuildContext context) {
    final pad = widget.sidePad;
    return LayoutBuilder(builder: (context, c) {
      final avail = c.maxWidth - pad * 2;
      _perPage =
          ((avail + _gap) / (widget.targetCardWidth + _gap)).floor().clamp(1, 4);
      final cardW = (avail - _gap * (_perPage - 1)) / _perPage;
      _stride = avail + _gap;
      final pages = _pages;
      if (_page > pages - 1) _page = pages - 1;

      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(pad, 18, pad, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(widget.title.toUpperCase(),
                          style: const TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.w900,
                              fontStyle: FontStyle.italic,
                              letterSpacing: -0.2)),
                      if (widget.subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(widget.subtitle!,
                            style: const TextStyle(
                                fontSize: 13, color: LT.textDim)),
                      ],
                    ],
                  ),
                ),
                if (pages > 1) _pager(pages),
              ],
            ),
          ),
          SizedBox(
            height: widget.height,
            child: ListView.separated(
              controller: _ctrl,
              scrollDirection: Axis.horizontal,
              padding: EdgeInsets.symmetric(horizontal: pad),
              physics: const ClampingScrollPhysics(),
              itemCount: widget.count,
              separatorBuilder: (_, __) => const SizedBox(width: _gap),
              itemBuilder: (context, i) =>
                  SizedBox(width: cardW, child: widget.itemBuilder(context, i)),
            ),
          ),
        ],
      );
    });
  }

  Widget _pager(int pages) {
    Widget arrow(IconData icon, bool enabled, int dir) => InkResponse(
          onTap: enabled ? () => _go(dir) : null,
          radius: 18,
          child: Icon(icon, size: 22, color: enabled ? LT.text : LT.textFaint),
        );
    return Row(mainAxisSize: MainAxisSize.min, children: [
      arrow(Icons.chevron_left, _page > 0, -1),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Text('${_page + 1} of $pages',
            style: const TextStyle(
                fontSize: 13, fontWeight: FontWeight.w700, color: LT.textDim)),
      ),
      arrow(Icons.chevron_right, _page < pages - 1, 1),
    ]);
  }
}

// Visible placeholder for a section that has no items yet (e.g. offseason).
class _EmptySection extends StatelessWidget {
  final String title;
  final String message;
  const _EmptySection({required this.title, required this.message});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 22, 20, 12),
          child: Text(title.toUpperCase(),
              style: const TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w900,
                  fontStyle: FontStyle.italic,
                  letterSpacing: -0.2)),
        ),
        Container(
          margin: const EdgeInsets.fromLTRB(20, 0, 20, 4),
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: LT.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: LT.border),
          ),
          child: Row(children: [
            const Icon(Icons.shield_outlined, size: 18, color: LT.textDim),
            const SizedBox(width: 10),
            Expanded(
              child: Text(message,
                  style: const TextStyle(
                      fontSize: 13, height: 1.35, color: LT.textDim)),
            ),
          ]),
        ),
      ],
    );
  }
}

// A category-tinted backdrop block (our no-photo stand-in for the NFL thumbnail).
class _CatBackdrop extends StatelessWidget {
  final String newsType;
  final double height;
  const _CatBackdrop({required this.newsType, required this.height});

  @override
  Widget build(BuildContext context) {
    final m = categoryMeta(newsType);
    final glyphs = _glyphVariants[newsType] ?? _glyphVariants['general']!;
    final glyph = glyphs[newsType.hashCode.abs() % glyphs.length];
    return Container(
      height: height,
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: const BorderRadius.all(Radius.circular(12)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [m.hue.withOpacity(0.55), LT.surface],
        ),
      ),
      child: Stack(children: [
        Positioned(
          right: -6,
          bottom: -8,
          child: Icon(glyph, size: height * 0.7, color: Colors.white.withOpacity(0.10)),
        ),
        Positioned(left: 10, top: 10, child: _TypeChip(type: newsType, onDark: true)),
      ]),
    );
  }
}

// ---- Opponent News (news about this week's matchup opponent) ----
class OpponentNewsRow extends StatefulWidget {
  final String leagueId;
  final String userId;
  final double sidePad;
  const OpponentNewsRow(
      {required this.leagueId, required this.userId, this.sidePad = 20});

  @override
  State<OpponentNewsRow> createState() => _OpponentNewsRowState();
}

class _OpponentNewsRowState extends State<OpponentNewsRow>
    with AutomaticKeepAliveClientMixin {
  final _service = OpponentNewsService();
  late Future<OpponentNews> _future;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _future = _service.get(leagueId: widget.leagueId, userId: widget.userId);
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return FutureBuilder<OpponentNews>(
      future: _future,
      builder: (context, snap) {
        final data = snap.data;
        final items = data?.items ?? const [];
        if (snap.connectionState == ConnectionState.waiting) {
          return const SizedBox(
              height: 130,
              child: Center(child: CircularProgressIndicator(color: LT.accent)));
        }
        if (items.isEmpty) {
          return _EmptySection(
            title: 'Opponent News',
            message: data?.opponentName != null
                ? 'No recent news on ${data!.opponentName}’s roster.'
                : 'Your weekly matchup isn’t set yet — opponent news shows up once the season is live.',
          );
        }
        final sub = data?.opponentName != null
            ? 'Scouting ${data!.opponentName}'
            : 'Who you\'re facing this week';
        return _Carousel(
          title: 'Opponent News',
          subtitle: sub,
          count: items.length,
          sidePad: widget.sidePad,
          itemBuilder: (_, i) => _OpponentCard(item: items[i]),
        );
      },
    );
  }
}

class _OpponentCard extends StatelessWidget {
  final OpponentNewsItem item;
  const _OpponentCard({required this.item});

  @override
  Widget build(BuildContext context) {
    final p = item.players.isNotEmpty ? item.players.first : null;
    final g = item.game;
    return GestureDetector(
      onTap: () => openItem(item.url),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CatBackdrop(newsType: item.newsType, height: 120),
          const SizedBox(height: 10),
          if (p != null) ...[
            Row(children: [
              Text(p.position ?? '',
                  style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w800,
                      color: LT.positionColor(p.position))),
              const SizedBox(width: 5),
              Flexible(
                child: Text(p.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: LT.text)),
              ),
              if (p.injury != null) ...[
                const SizedBox(width: 5),
                Text(_PlayerChip._injuryCode(p.injury) ?? '',
                    style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: LT.hot)),
              ],
            ]),
            const SizedBox(height: 6),
          ],
          Text(
            item.headline,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
                fontSize: 14,
                height: 1.3,
                fontWeight: FontWeight.w600,
                color: LT.text),
          ),
          const SizedBox(height: 6),
          if (g != null && (g.bye || g.opponent != null || g.weather != null))
            _GameContextLine(game: g),
        ],
      ),
    );
  }
}

// Folded-in game context: e.g. "@ KC · Tough · Rain" or "BYE".
class _GameContextLine extends StatelessWidget {
  final OppGame game;
  const _GameContextLine({required this.game});

  @override
  Widget build(BuildContext context) {
    if (game.bye) {
      return const Text('ON BYE',
          style: TextStyle(
              fontSize: 11, fontWeight: FontWeight.w800, color: LT.textDim));
    }
    final parts = <String>[];
    if (game.opponent != null) {
      parts.add('${game.homeAway == 'away' ? '@' : 'vs'} ${game.opponent}');
    }
    if (game.difficulty != null) {
      parts.add(game.difficulty![0].toUpperCase() + game.difficulty!.substring(1));
    }
    if (game.weather != null) parts.add(game.weather!);
    final diff = game.difficulty;
    final hue = diff == 'tough'
        ? LT.hot
        : diff == 'easy'
            ? const Color(0xFF7DD3A8)
            : LT.textDim;
    return Row(children: [
      Icon(Icons.stadium, size: 12, color: hue),
      const SizedBox(width: 4),
      Flexible(
        child: Text(parts.join(' · '),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
                fontSize: 11.5, fontWeight: FontWeight.w700, color: hue)),
      ),
    ]);
  }
}

// Small reporter byline chip for the carousels (works without a FeedItem).
class _ReporterChip extends StatelessWidget {
  final String reporter;
  final String? name;
  const _ReporterChip({required this.reporter, this.name});

  @override
  Widget build(BuildContext context) {
    late final IconData icon;
    late final Color hue;
    late final String fallback;
    switch (reporter) {
      case 'breaking':
        icon = Icons.bolt;
        hue = LT.hot;
        fallback = 'Breaking Desk';
        break;
      case 'social':
        icon = Icons.campaign;
        hue = const Color(0xFFB98AFF);
        fallback = 'The Voice';
        break;
      default:
        icon = Icons.edit_note;
        hue = const Color(0xFF6CA8FF);
        fallback = 'The Beat';
    }
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 13, color: hue),
      const SizedBox(width: 4),
      Text((name ?? fallback).toUpperCase(),
          style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.6,
              color: hue)),
    ]);
  }
}

// A category label chip (e.g. INJURY) tinted to the category hue.
class _TypeChip extends StatelessWidget {
  final String type;
  final bool onDark;
  const _TypeChip({required this.type, this.onDark = false});

  @override
  Widget build(BuildContext context) {
    final m = categoryMeta(type);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: m.hue.withOpacity(onDark ? 0.22 : 0.16),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: m.hue.withOpacity(0.45)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(m.icon, size: 12, color: m.hue),
        const SizedBox(width: 5),
        Text(m.label,
            style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.5,
                color: m.hue)),
      ]),
    );
  }
}

class _Hero extends StatelessWidget {
  final FeedItem item;
  final EdgeInsetsGeometry padding;
  final double aspectRatio; // width : height of the hero block
  const _Hero({
    required this.item,
    this.padding = const EdgeInsets.fromLTRB(20, 8, 20, 14),
    this.aspectRatio = 1.15,
  });

  @override
  Widget build(BuildContext context) {
    final team = LT.teamColor(_teamOf(item));
    return Padding(
      padding: padding,
      child: GestureDetector(
        onTap: () => openItem(item.url),
        child: AspectRatio(
          aspectRatio: aspectRatio,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [team.withOpacity(0.92), team.withOpacity(0.30), LT.surface],
              ),
              border: Border.all(color: LT.border),
              boxShadow: LT.glow,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // Branded "tap ripple" backdrop — our stand-in for a hero photo.
                  Positioned.fill(child: CustomPaint(painter: _RipplePainter())),
                  // Oversized category glyph, faint, for context.
                  Positioned(
                    right: -40,
                    top: -30,
                    child: Icon(backdropGlyph(item),
                        size: 230, color: Colors.white.withOpacity(0.07)),
                  ),
                  // Bottom scrim so the headline stays legible.
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          stops: const [0.45, 1.0],
                          colors: [
                            Colors.transparent,
                            Colors.black.withOpacity(0.55),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Top meta row. Badges wrap to a second line when
                        // a long type + reporter combination doesn't fit one
                        // line, rather than clipping or forcing an overflow.
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Wrap(
                                spacing: 8,
                                runSpacing: 6,
                                crossAxisAlignment: WrapCrossAlignment.center,
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: LT.accent,
                                      borderRadius: BorderRadius.circular(5),
                                    ),
                                    child: const Text('FEATURED',
                                        style: TextStyle(
                                            fontSize: 10.5,
                                            fontWeight: FontWeight.w800,
                                            letterSpacing: 0.6,
                                            color: Colors.black)),
                                  ),
                                  _TypeChip(type: item.newsType, onDark: true),
                                  if (reporterMeta(item) != null)
                                    _ReporterBadge(item: item, onDark: true),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            if (timeframeLabel(item.timeframe) != null)
                              Padding(
                                padding: const EdgeInsets.only(right: 8),
                                child: Text(timeframeLabel(item.timeframe)!,
                                    style: const TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: 0.6,
                                        color: LT.accent)),
                              ),
                            Text(relativeTime(item.publishedAt),
                                style: const TextStyle(
                                    fontSize: 12, color: Color(0xFFB9C0CC))),
                          ],
                        ),
                        // Headline + context pinned to the bottom, NFL-style.
                        const Spacer(),
                        Text(
                          item.blurb?.isNotEmpty == true
                              ? item.blurb!
                              : item.headline,
                          maxLines: 4,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 23,
                              height: 1.25,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                              letterSpacing: -0.5),
                        ),
                        if (item.reasoning?.isNotEmpty == true) ...[
                          const SizedBox(height: 10),
                          Text(item.reasoning!,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: 13.5,
                                  height: 1.35,
                                  fontStyle: FontStyle.italic,
                                  color: Colors.white.withOpacity(0.82))),
                        ],
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            if (item.action != null)
                              _ActionChip(
                                  action: item.action!,
                                  severity: item.severity),
                            ...item.myPlayers.map((p) => _PlayerChip(player: p)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// Concentric "tap ripple" rings — the LeagueTap mark, rendered as hero backdrop
// art so we don't need a photo. Rings emanate from a point like a tap on water.
class _RipplePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final origin = Offset(size.width * 0.74, size.height * 0.40);
    final maxR = size.longestSide * 1.05;
    const rings = 9;
    for (int i = rings; i >= 1; i--) {
      final r = maxR * (i / rings);
      final fade = 1 - (i / rings); // inner rings brighter
      canvas.drawCircle(
        origin,
        r,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5
          ..color = Colors.white.withOpacity(0.05 + fade * 0.10),
      );
    }
    // The "tap" point.
    canvas.drawCircle(
        origin, 7, Paint()..color = Colors.white.withOpacity(0.22));
    canvas.drawCircle(
        origin,
        16,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = Colors.white.withOpacity(0.20));
  }

  @override
  bool shouldRepaint(covariant _RipplePainter oldDelegate) => false;
}

// The "NEWS" side rail (NFL.com style): a panel of compact headline rows for
// the rest of your team's news, next to the hero feature.
class _TeamNewsPanel extends StatelessWidget {
  final List<FeedItem> items;
  final String? teamName;
  final bool offseason;
  final ValueChanged<bool> onToggleOffseason;
  const _TeamNewsPanel({
    required this.items,
    this.teamName,
    this.offseason = false,
    required this.onToggleOffseason,
  });

  @override
  Widget build(BuildContext context) {
    final shown = items.take(10).toList();
    return Container(
      decoration: BoxDecoration(
        color: LT.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: LT.border),
        boxShadow: LT.glow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 12, 10),
            child: Row(children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('FOR YOUR TEAM',
                        style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.6,
                            color: LT.textFaint)),
                    const SizedBox(height: 2),
                    Text(
                        teamName?.isNotEmpty == true ? teamName! : 'Your Team',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.2,
                            color: LT.text)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _OffseasonToggle(value: offseason, onChanged: onToggleOffseason),
            ]),
          ),
          const Divider(height: 1, color: LT.border),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [for (final it in shown) _NewsRow(item: it)],
            ),
          ),
        ],
      ),
    );
  }
}

// Compact offseason-mode toggle (snowflake pill) for the team panel header.
class _OffseasonToggle extends StatelessWidget {
  final bool value;
  final ValueChanged<bool> onChanged;
  const _OffseasonToggle({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final c = value ? LT.accent : LT.textFaint;
    return GestureDetector(
      onTap: () => onChanged(!value),
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        decoration: BoxDecoration(
          color: value ? LT.accent.withOpacity(0.16) : LT.surfaceHi,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
              color: value ? LT.accent.withOpacity(0.5) : LT.border),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.ac_unit, size: 12, color: c),
          const SizedBox(width: 4),
          Text('OFFSEASON',
              style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.5,
                  color: c)),
        ]),
      ),
    );
  }
}

// One compact headline row in the team news rail.
class _NewsRow extends StatelessWidget {
  final FeedItem item;
  const _NewsRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final m = categoryMeta(item.newsType);
    return GestureDetector(
      onTap: () => openItem(item.url),
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: m.hue.withOpacity(0.16),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: m.hue.withOpacity(0.4)),
              ),
              child: Icon(m.icon, size: 17, color: m.hue),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    if (reporterMeta(item) != null)
                      Expanded(child: _ReporterBadge(item: item))
                    else
                      const Spacer(),
                    if (relativeTime(item.publishedAt).isNotEmpty)
                      Text(relativeTime(item.publishedAt),
                          style: const TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w600,
                              color: LT.textFaint)),
                  ]),
                  const SizedBox(height: 5),
                  Text(
                    item.blurb?.isNotEmpty == true
                        ? item.blurb!
                        : item.headline,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 13.5,
                        height: 1.3,
                        fontWeight: FontWeight.w600,
                        color: LT.text),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      if (item.action != null)
                        _ActionChip(
                            action: item.action!, severity: item.severity),
                      if (item.myPlayers.isNotEmpty)
                        _PlayerChip(player: item.myPlayers.first),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// A suggested-action pill (Start / Sit / Add …) tinted by severity.
class _ActionChip extends StatelessWidget {
  final String action;
  final String? severity;
  const _ActionChip({required this.action, this.severity});

  Color get _hue {
    switch (severity) {
      case 'high':
        return LT.hot;
      case 'medium':
        return const Color(0xFFFFB020);
      default:
        return LT.accent;
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = _hue;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: c.withOpacity(0.18),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: c.withOpacity(0.5)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.bolt, size: 12, color: c),
        const SizedBox(width: 4),
        Text(action.toUpperCase(),
            style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.5,
                color: c)),
      ]),
    );
  }
}

class _PlayerChip extends StatelessWidget {
  final MyPlayer player;
  const _PlayerChip({required this.player});

  @override
  Widget build(BuildContext context) {
    final c = LT.positionColor(player.position);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: c.withOpacity(0.16),
        borderRadius: BorderRadius.circular(7),
        border: Border.all(color: c.withOpacity(0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(player.position ?? '',
              style: TextStyle(
                  fontSize: 10.5, fontWeight: FontWeight.w800, color: c)),
          const SizedBox(width: 5),
          Text(player.name,
              style: const TextStyle(
                  fontSize: 12.5, fontWeight: FontWeight.w600, color: LT.text)),
          if (_injuryCode(player.injury) != null) ...[
            const SizedBox(width: 5),
            Text(_injuryCode(player.injury)!,
                style: const TextStyle(
                    fontSize: 10, fontWeight: FontWeight.w800, color: LT.hot)),
          ],
        ],
      ),
    );
  }

  // Short injury tag (Questionable -> "Q", Out -> "OUT", IR -> "IR").
  static String? _injuryCode(String? s) {
    if (s == null || s.isEmpty) return null;
    final u = s.toUpperCase();
    if (u.startsWith('QUESTION')) return 'Q';
    if (u.startsWith('DOUBT')) return 'D';
    if (u == 'OUT') return 'OUT';
    if (u.contains('IR')) return 'IR';
    if (u.startsWith('PUP')) return 'PUP';
    return u.length <= 4 ? u : u.substring(0, 3);
  }
}

