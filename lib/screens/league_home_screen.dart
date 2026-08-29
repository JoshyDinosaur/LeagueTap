import 'package:flutter/material.dart';

import '../models/league_feed_models.dart';
import '../services/league_feed_service.dart';
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
              SizedBox(height: 100),
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
          return ListView.builder(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
            physics: const AlwaysScrollableScrollPhysics(),
            itemCount: items.length,
            itemBuilder: (_, i) => _LeagueCard(item: items[i]),
          );
        },
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
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: LT.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: LT.border),
        ),
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
            const SizedBox(height: 14),
            Text(
              item.blurb?.isNotEmpty == true ? item.blurb! : item.headline,
              style: const TextStyle(
                  fontSize: 17,
                  height: 1.32,
                  fontWeight: FontWeight.w700,
                  color: LT.text,
                  letterSpacing: -0.2),
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
                style: const TextStyle(
                    fontSize: 13, height: 1.3, color: LT.textDim)),
            const SizedBox(height: 10),
            Row(children: [
              Text(item.source,
                  style: const TextStyle(fontSize: 12, color: LT.textFaint)),
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
