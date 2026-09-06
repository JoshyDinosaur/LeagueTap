import 'package:flutter/material.dart';

import '../models/feed_models.dart';
import '../models/game_context_models.dart';
import '../models/matchup_models.dart';
import '../services/game_context_service.dart';
import '../services/matchup_service.dart';
import '../theme.dart';
import 'feed_screen.dart' show OpponentNewsRow;

/// Matchup + per-team game context bundled for the Gameplan tab.
class GameplanData {
  final MatchupContext matchup;
  final Map<String, GameContext> contextByTeam;
  GameplanData(this.matchup, this.contextByTeam);
}

class GameplanTab extends StatefulWidget {
  final String leagueId;
  final String userId;
  const GameplanTab({super.key, required this.leagueId, required this.userId});

  @override
  State<GameplanTab> createState() => _GameplanTabState();
}

class _GameplanTabState extends State<GameplanTab>
    with AutomaticKeepAliveClientMixin {
  final _service = MatchupService();
  final _contextService = GameContextService();
  late Future<GameplanData> _future;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _future = _loadAll();
  }

  Future<GameplanData> _loadAll() async {
    final matchup =
        await _service.load(leagueId: widget.leagueId, userId: widget.userId);
    final teams = matchup.me.starters
        .map((p) => p.team ?? '')
        .where((t) => t.isNotEmpty)
        .toList();
    Map<String, GameContext> ctx = {};
    try {
      ctx = await _contextService.getByTeams(teams);
    } catch (_) {
      ctx = {};
    }
    return GameplanData(matchup, ctx);
  }

  Future<void> _refresh() async {
    final f = _loadAll();
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
      child: FutureBuilder<GameplanData>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(
                child: CircularProgressIndicator(color: LT.accent));
          }
          if (!snap.hasData) {
            return ListView(children: const [
              SizedBox(height: 120),
              Center(
                  child: Text('Couldn’t load your matchup.',
                      style: TextStyle(color: LT.textDim))),
            ]);
          }
          final ctx = snap.data!.matchup;
          final ctxByTeam = snap.data!.contextByTeam;
          return ListView(
            padding: const EdgeInsets.only(bottom: 28),
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              _WeekBanner(ctx: ctx),
              _MatchupHeader(ctx: ctx),
              _section('Key considerations',
                  'Game context for your starters'),
              _ConsiderationsRail(
                  starters: ctx.me.starters, contextByTeam: ctxByTeam),
              const SizedBox(height: 8),
              _section('Your opponent', 'Who you’re up against'),
              _OpponentBlock(ctx: ctx),
              const SizedBox(height: 8),
              // OpponentNewsRow renders its own title/subtitle header (via
              // _Carousel / _EmptySection), so no separate _section() call
              // here -- that was producing a duplicate 'Opponent News' header.
              OpponentNewsRow(leagueId: widget.leagueId, userId: widget.userId, sidePad: 20),
            ],
          );
        },
      ),
    );
  }

  Widget _section(String title, String sub) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 22, 20, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.4)),
            const SizedBox(height: 2),
            Text(sub, style: const TextStyle(fontSize: 13, color: LT.textDim)),
          ],
        ),
      );
}

class _WeekBanner extends StatelessWidget {
  final MatchupContext ctx;
  const _WeekBanner({required this.ctx});

  @override
  Widget build(BuildContext context) {
    final label = ctx.hasMatchup
        ? 'Week ${ctx.week}'
        : ctx.seasonType == 'pre'
            ? 'Preseason'
            : 'Off-season';
    final right = ctx.hasMatchup
        ? 'Upcoming matchup'
        : 'Week 1 matchup appears at kickoff';
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
      decoration: BoxDecoration(
        color: LT.accentDim.withOpacity(0.5),
        borderRadius: BorderRadius.circular(12),
        border: Border(left: BorderSide(color: LT.accent, width: 3)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: const TextStyle(
                  fontSize: 14, fontWeight: FontWeight.w800, color: LT.text)),
          Text(right,
              style: const TextStyle(fontSize: 12.5, color: LT.textDim)),
        ],
      ),
    );
  }
}

class _MatchupHeader extends StatelessWidget {
  final MatchupContext ctx;
  const _MatchupHeader({required this.ctx});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 14, 20, 0),
      padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 8),
      decoration: BoxDecoration(
        color: LT.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: LT.border),
      ),
      child: Row(
        children: [
          Expanded(child: _TeamBlock(name: ctx.me.name, record: ctx.me.record)),
          const Text('VS',
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: LT.textFaint,
                  letterSpacing: 1)),
          Expanded(
            child: ctx.opponent != null
                ? _TeamBlock(
                    name: ctx.opponent!.name,
                    record: ctx.opponent!.record,
                    highlight: true)
                : const _TeamBlock(name: 'Opponent TBD', record: '—'),
          ),
        ],
      ),
    );
  }
}

class _TeamBlock extends StatelessWidget {
  final String name;
  final String record;
  final bool highlight;
  const _TeamBlock(
      {required this.name, required this.record, this.highlight = false});

  @override
  Widget build(BuildContext context) {
    final initials = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .take(2)
        .map((w) => w[0].toUpperCase())
        .join();
    return Column(
      children: [
        Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: highlight ? LT.accentDim : LT.surfaceHi,
            border: Border.all(
                color: highlight ? LT.accent : LT.border, width: 1.5),
          ),
          alignment: Alignment.center,
          child: Text(initials.isEmpty ? '–' : initials,
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: highlight ? LT.accent : LT.text)),
        ),
        const SizedBox(height: 10),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6),
          child: Text(name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 14, fontWeight: FontWeight.w700)),
        ),
        const SizedBox(height: 3),
        Text(record, style: const TextStyle(fontSize: 12, color: LT.textDim)),
      ],
    );
  }
}

class _ConsiderationsRail extends StatelessWidget {
  final List<MyPlayer> starters;
  final Map<String, GameContext> contextByTeam;
  const _ConsiderationsRail(
      {required this.starters, required this.contextByTeam});

  @override
  Widget build(BuildContext context) {
    if (starters.isEmpty) {
      return const Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 4),
        child: Text('Your starting lineup will show here once it’s set.',
            style: TextStyle(color: LT.textDim, fontSize: 13)),
      );
    }
    return SizedBox(
      height: 158,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
        itemCount: starters.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) => _ConsiderationCard(
          player: starters[i],
          ctx: contextByTeam[starters[i].team],
        ),
      ),
    );
  }
}

IconData _weatherIcon(String? icon) {
  switch (icon) {
    case 'rain':
      return Icons.water_drop_outlined;
    case 'snow':
      return Icons.ac_unit;
    case 'wind':
      return Icons.air;
    case 'cold':
      return Icons.severe_cold;
    case 'clouds':
      return Icons.cloud_outlined;
    case 'dome':
      return Icons.stadium_outlined;
    default:
      return Icons.wb_sunny_outlined;
  }
}

Color _difficultyColor(String? tier) {
  switch (tier) {
    case 'tough':
      return LT.hot;
    case 'easy':
      return LT.accent;
    default:
      return const Color(0xFFFFB020);
  }
}

class _ConsiderationCard extends StatelessWidget {
  final MyPlayer player;
  final GameContext? ctx;
  const _ConsiderationCard({required this.player, this.ctx});

  String _kickoff(DateTime? t) {
    if (t == null) return '';
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    final l = t.toLocal();
    int h = l.hour % 12;
    if (h == 0) h = 12;
    final ap = l.hour >= 12 ? 'pm' : 'am';
    return '${days[(l.weekday - 1) % 7]} $h$ap';
  }

  @override
  Widget build(BuildContext context) {
    final team = LT.teamColor(player.team);
    final bye = ctx?.bye == true;
    final matchupLine = ctx == null
        ? 'Matchup pending'
        : bye
            ? 'On bye'
            : '${ctx!.homeAway == 'home' ? 'vs' : '@'} ${ctx!.opp ?? ''}'
                '${_kickoff(ctx!.kickoff).isNotEmpty ? ' · ${_kickoff(ctx!.kickoff)}' : ''}';

    return Container(
      width: 196,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [team.withOpacity(0.55), LT.surface],
        ),
        border: Border.all(color: LT.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Text(player.position ?? '',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: LT.positionColor(player.position))),
            const SizedBox(width: 8),
            Expanded(
              child: Text(matchupLine,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: LT.textDim)),
            ),
          ]),
          const SizedBox(height: 6),
          Text(player.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontSize: 16, fontWeight: FontWeight.w800, height: 1.2)),
          const Spacer(),
          if (bye)
            _chip(Icons.bedtime_outlined, 'Bye week', LT.textDim)
          else
            Row(children: [
              if (ctx?.weatherLabel != null)
                _chip(
                    _weatherIcon(ctx!.weatherIcon),
                    ctx!.tempF != null && ctx!.weatherLabel != 'Indoor'
                        ? '${ctx!.weatherLabel} ${ctx!.tempF}°'
                        : ctx!.weatherLabel!,
                    LT.textDim),
              if (ctx?.weatherLabel != null && ctx?.difficultyLabel != null)
                const SizedBox(width: 6),
              if (ctx?.difficultyLabel != null)
                _chip(Icons.shield_outlined, ctx!.difficultyLabel!,
                    _difficultyColor(ctx!.difficultyTier)),
              if (ctx?.weatherLabel == null && ctx?.difficultyLabel == null)
                _chip(Icons.schedule, 'Context soon', LT.textFaint),
            ]),
        ],
      ),
    );
  }

  Widget _chip(IconData icon, String label, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(
          color: color.withOpacity(0.14),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(label,
              style: TextStyle(
                  fontSize: 10.5, color: color, fontWeight: FontWeight.w600)),
        ]),
      );
}

class _OpponentBlock extends StatelessWidget {
  final MatchupContext ctx;
  const _OpponentBlock({required this.ctx});

  @override
  Widget build(BuildContext context) {
    final opp = ctx.opponent;
    if (opp == null) {
      return const Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
        child: Text(
            'Your opponent is set when the season schedule drops. Their lineup and key threats will appear here.',
            style: TextStyle(color: LT.textDim, fontSize: 13, height: 1.4)),
      );
    }
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 8),
      decoration: BoxDecoration(
        color: LT.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: LT.border),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
            child: Row(children: [
              Expanded(
                child: Text(opp.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w800)),
              ),
              Text(opp.record,
                  style: const TextStyle(fontSize: 13, color: LT.textDim)),
            ]),
          ),
          const Divider(height: 1, color: LT.border),
          ...opp.starters.map((p) => Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(children: [
                  SizedBox(
                    width: 34,
                    child: Text(p.position ?? '',
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: LT.positionColor(p.position))),
                  ),
                  Expanded(
                    child: Text(p.name,
                        style: const TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w600)),
                  ),
                  Text(p.team ?? '',
                      style:
                          const TextStyle(fontSize: 12, color: LT.textFaint)),
                ]),
              )),
          const SizedBox(height: 6),
        ],
      ),
    );
  }
}
