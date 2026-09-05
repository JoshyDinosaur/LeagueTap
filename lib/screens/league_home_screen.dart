import 'package:flutter/material.dart';

import '../models/ledger_models.dart';
import '../models/league_feed_models.dart';
import '../models/matchup_models.dart' show TeamSide;
import '../services/ledger_service.dart';
import '../services/league_feed_service.dart';
import '../services/league_lineups_service.dart';
import '../theme.dart';
import 'feed_screen.dart' show categoryMeta, relativeTime, openItem;

class LeagueHomeTab extends StatefulWidget {
  final String leagueId;
  const LeagueHomeTab({super.key, required this.leagueId});

  @override
  State<LeagueHomeTab> createState() => _LeagueHomeTabState();
}

class _LeagueHomeTabState extends State<LeagueHomeTab>
    with AutomaticKeepAliveClientMixin {
  final _service = LeagueFeedService();
  late Future<List<LeagueFeedItem>> _future;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _future = _service.get(widget.leagueId);
  }

  Future<void> _refresh() async {
    final f = _service.get(widget.leagueId);
    setState(() => _future = f);
    await f;
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return RefreshIndicator(
      color: LT.accent,
      backgroundColor: LT.surface,
      onRefresh: _refresh,
      child: FutureBuilder<List<LeagueFeedItem>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(
                child: CircularProgressIndicator(color: LT.accent));
          }
          final items = snap.data ?? const [];
          if (items.isEmpty) {
            return ListView(children: const [
              _Masthead(),
              SizedBox(height: 80),
              Center(
                child: Padding(
                  padding: EdgeInsets.all(40),
                  child: Text(
                      'No league news yet.\nThis fills up across your whole league during the season.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: LT.textDim, height: 1.5)),
                ),
              ),
            ]);
          }
          return CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              const SliverToBoxAdapter(child: _Masthead()),
              SliverToBoxAdapter(child: _StartsSitsSection(leagueId: widget.leagueId)),
              SliverToBoxAdapter(child: _LedgerSection(leagueId: widget.leagueId)),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
                sliver: SliverList.separated(
                  itemCount: items.length,
                  separatorBuilder: (_, __) =>
                      const Divider(height: 1, color: LT.border),
                  itemBuilder: (_, i) => _LeagueCard(item: items[i]),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}


// The nameplate: LeagueTap's front page, styled like a paper's masthead —
// serif wordmark, a dateline, and a double rule instead of a boxed header.

// League-wide "Who's Starting" strip — a horizontally scrollable box score of
// every manager's current lineup for the week, sourced straight from Sleeper.
// Read-only for now; grading calls as smart/dumb/funny after kickoff is a
// planned follow-up once weekly per-player scoring is wired in.
class _StartsSitsSection extends StatefulWidget {
  final String leagueId;
  const _StartsSitsSection({required this.leagueId});

  @override
  State<_StartsSitsSection> createState() => _StartsSitsSectionState();
}

class _StartsSitsSectionState extends State<_StartsSitsSection> {
  final _service = LeagueLineupsService();
  late Future<LeagueLineups> _future;

  @override
  void initState() {
    super.initState();
    _future = _service.load(widget.leagueId);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<LeagueLineups>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: SizedBox(
              height: 40,
              child: Center(
                  child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: LT.accent))),
            ),
          );
        }
        final lineups = snap.data;
        // Supplementary section — fail quiet rather than break the feed.
        if (lineups == null || lineups.teams.every((t) => t.starters.isEmpty)) {
          return const SizedBox.shrink();
        }
        return Padding(
          padding: const EdgeInsets.fromLTRB(0, 0, 0, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
                child: Row(children: [
                  Text('WHO\'S STARTING', style: LT.mono(size: 11, weight: FontWeight.w600, color: LT.textDim)),
                  const SizedBox(width: 8),
                  Container(width: 1, height: 11, color: LT.border),
                  const SizedBox(width: 8),
                  Text(
                      lineups.locked
                          ? 'WEEK ${lineups.week} · LOCKED'
                          : 'WEEK ${lineups.week} · SETTING NOW',
                      style: LT.mono(
                          size: 11,
                          weight: FontWeight.w600,
                          color: lineups.locked ? LT.textFaint : LT.accent)),
                ]),
              ),
              SizedBox(
                height: 224,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  itemCount: lineups.teams.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (_, i) => _LineupCard(team: lineups.teams[i]),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _LineupCard extends StatelessWidget {
  final TeamSide team;
  const _LineupCard({required this.team});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 190,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: LT.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: LT.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(team.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: LT.serif(size: 14, weight: FontWeight.w700)),
          const SizedBox(height: 8),
          Expanded(
            child: SingleChildScrollView(
              physics: const ClampingScrollPhysics(),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final p in team.starters)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 5),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SizedBox(
                            width: 26,
                            child: Text(p.position ?? '',
                                style: TextStyle(
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w800,
                                    color: LT.positionColor(p.position))),
                          ),
                          Expanded(
                            child: Text(p.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontSize: 12, color: LT.text)),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}


// "The Ledger" — a horizontally scrollable carousel of write-ups on
// start/sit calls: bench blunders, smart calls, multi-week streaks, and
// toss-up decisions still to be made. Generated separately from the
// news-sourced feed above so it reads as its own distinct voice rather
// than blending into real reporting. Sits directly under "Who's Starting"
// so the roster-management thread reads together before the main feed.
class _LedgerSection extends StatefulWidget {
  final String leagueId;
  const _LedgerSection({required this.leagueId});

  @override
  State<_LedgerSection> createState() => _LedgerSectionState();
}

class _LedgerSectionState extends State<_LedgerSection> {
  final _service = LedgerService();
  late Future<List<LedgerItem>> _future;

  @override
  void initState() {
    super.initState();
    _future = _service.get(widget.leagueId);
  }

  static const _categoryMeta = {
    'blunder': (label: 'BLUNDER', color: LT.hot),
    'steal': (label: 'STEAL', color: Color(0xFF7DD3A8)),
    'streak': (label: 'STREAK', color: Color(0xFFFFB020)),
    'toss_up': (label: 'TOSS-UP', color: Color(0xFF6FA8DC)),
  };

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<LedgerItem>>(
      future: _future,
      builder: (context, snap) {
        final items = snap.data ?? const [];
        if (snap.connectionState != ConnectionState.waiting && items.isEmpty) {
          return const SizedBox.shrink();
        }
        return Padding(
          padding: const EdgeInsets.fromLTRB(0, 4, 0, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
                child: Row(children: [
                  Text('THE LEDGER',
                      style: LT.mono(size: 11, weight: FontWeight.w600, color: LT.textDim)),
                  const SizedBox(width: 8),
                  Container(width: 1, height: 11, color: LT.border),
                  const SizedBox(width: 8),
                  Text('who\'s up, who\'s down',
                      style: LT.mono(size: 11, weight: FontWeight.w400, color: LT.textFaint)),
                ]),
              ),
              if (snap.connectionState == ConnectionState.waiting)
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 0, 20, 16),
                  child: SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: LT.accent)),
                )
              else
                SizedBox(
                  height: 224,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 10),
                    itemBuilder: (_, i) => _LedgerCard(item: items[i], meta: _categoryMeta),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _LedgerCard extends StatelessWidget {
  final LedgerItem item;
  final Map<String, ({String label, Color color})> meta;
  const _LedgerCard({required this.item, required this.meta});

  @override
  Widget build(BuildContext context) {
    final m = meta[item.category] ?? meta['blunder']!;
    return Container(
      width: 240,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: LT.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: LT.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                border: Border.all(color: m.color, width: 1),
                borderRadius: BorderRadius.circular(3),
              ),
              child: Text(m.label,
                  style: LT.mono(size: 9.5, weight: FontWeight.w700, color: m.color)),
            ),
            const SizedBox(width: 8),
            Text('WEEK ${item.week}',
                style: const TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                    color: LT.textFaint)),
          ]),
          if ((item.managerName ?? '').isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(item.managerName!.toUpperCase(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: LT.mono(size: 10, weight: FontWeight.w700, color: LT.accent, letterSpacing: 0.6)),
          ],
          const SizedBox(height: 8),
          Expanded(
            child: SingleChildScrollView(
              physics: const ClampingScrollPhysics(),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.headline,
                      style: LT.serif(size: 15, weight: FontWeight.w700, height: 1.25)),
                  const SizedBox(height: 6),
                  Text(item.text,
                      style: LT.serif(
                          size: 12.5,
                          weight: FontWeight.w400,
                          height: 1.35,
                          color: LT.textDim,
                          style: FontStyle.italic)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Masthead extends StatelessWidget {
  const _Masthead();

  static const _weekdays = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
  ];
  static const _months = [
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'
  ];

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final dateline =
        '${_weekdays[now.weekday - 1]}, ${_months[now.month - 1]} ${now.day}';
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 6, 20, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('LeagueTap',
              style: LT.serif(
                  size: 34, weight: FontWeight.w700, letterSpacing: -0.4)),
          const SizedBox(height: 4),
          Text(dateline.toUpperCase(),
              style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.2,
                  color: LT.textFaint)),
          const SizedBox(height: 12),
          Container(height: 2.5, color: LT.text),
          const SizedBox(height: 2),
          Container(height: 1, color: LT.border),
        ],
      ),
    );
  }
}

class _LeagueCard extends StatelessWidget {
  final LeagueFeedItem item;
  const _LeagueCard({required this.item});

  @override
  Widget build(BuildContext context) {
    final m = categoryMeta(item.newsType);
    return GestureDetector(
      onTap: () => openItem(item.url),
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              _typeChip(m.icon, m.label, m.hue),
              if (item.action != null) ...[
                const SizedBox(width: 8),
                _actionChip(item.action!, item.severity),
              ],
              const Spacer(),
              Text(relativeTime(item.publishedAt),
                  style: const TextStyle(fontSize: 12, color: LT.textFaint)),
            ]),
            if (item.reporter != null) ...[
              const SizedBox(height: 10),
              _reporterByline(item.reporter!, item.reporterName),
            ],
            const SizedBox(height: 12),
            Text(
              item.blurb?.isNotEmpty == true ? item.blurb! : item.headline,
              style: LT.serif(
                  size: 20, weight: FontWeight.w700, height: 1.28),
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children:
                  item.affected.map((a) => _AffectedChip(team: a)).toList(),
            ),
            const SizedBox(height: 12),
            Text(item.headline,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: LT.serif(
                    size: 14,
                    weight: FontWeight.w400,
                    height: 1.35,
                    color: LT.textDim,
                    style: FontStyle.italic)),
            const SizedBox(height: 10),
            Row(children: [
              Text(item.source.toUpperCase(),
                  style: const TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.6,
                      color: LT.textFaint)),
              const Spacer(),
              const Icon(Icons.north_east, size: 13, color: LT.textFaint),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _reporterByline(String reporter, String? name) {
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

  Widget _actionChip(String action, String? severity) {
    final hue = severity == 'high'
        ? LT.hot
        : severity == 'medium'
            ? const Color(0xFFFFB020)
            : LT.accent;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: hue.withOpacity(0.18),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: hue.withOpacity(0.5)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.bolt, size: 12, color: hue),
        const SizedBox(width: 4),
        Text(action.toUpperCase(),
            style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.5,
                color: hue)),
      ]),
    );
  }

  Widget _typeChip(IconData icon, String label, Color hue) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: hue.withOpacity(0.16),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: hue.withOpacity(0.45)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 12, color: hue),
          const SizedBox(width: 5),
          Text(label,
              style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.5,
                  color: hue)),
        ]),
      );
}

class _AffectedChip extends StatelessWidget {
  final AffectedTeam team;
  const _AffectedChip({required this.team});

  @override
  Widget build(BuildContext context) {
    final c = LT.positionColor(team.position);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: LT.surfaceHi,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: LT.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.shield_outlined, size: 13, color: LT.accent),
          const SizedBox(width: 5),
          Text(team.manager,
              style: const TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w700, color: LT.text)),
          const SizedBox(width: 6),
          Container(width: 1, height: 11, color: LT.border),
          const SizedBox(width: 6),
          Text(team.position ?? '',
              style: TextStyle(
                  fontSize: 10.5, fontWeight: FontWeight.w800, color: c)),
          const SizedBox(width: 4),
          Text(team.player,
              style: const TextStyle(fontSize: 12, color: LT.textDim)),
        ],
      ),
    );
  }
}
