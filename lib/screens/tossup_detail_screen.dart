import 'package:flutter/material.dart';

import '../models/ledger_models.dart';
import '../models/tossup_detail_models.dart';
import '../services/ledger_service.dart';
import '../theme.dart';
import 'feed_screen.dart' show relativeTime, openItem;

// The page ANY Ledger card opens into: the manager's aggregated Ledger
// decision record in this league (upper half), and -- when this specific
// decision has two identifiable players behind it (toss_up rows always;
// blunder rows sometimes) -- the articles actually behind that call
// (lower half). steal/streak rows and blunder rows without a clean pair
// just show the record half; there's no single choice to point at.
class TossupDetailScreen extends StatefulWidget {
  final LedgerItem item;
  const TossupDetailScreen({super.key, required this.item});

  @override
  State<TossupDetailScreen> createState() => _TossupDetailScreenState();
}

class _TossupDetailScreenState extends State<TossupDetailScreen> {
  final _service = LedgerService();
  late Future<TossupDetail?> _future;

  @override
  void initState() {
    super.initState();
    _future = _service.tossupDetail(widget.item.id);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: LT.bg,
      appBar: AppBar(
        backgroundColor: LT.bg,
        elevation: 0,
        iconTheme: const IconThemeData(color: LT.text),
        title: Text('The Ledger',
            style: LT.serif(size: 18, weight: FontWeight.w700)),
      ),
      body: FutureBuilder<TossupDetail?>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator(color: LT.accent));
          }
          final detail = snap.data;
          if (detail == null) {
            return Center(
              child: Text("Couldn't load this decision.",
                  style: TextStyle(color: LT.textDim)),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              _TossupHeader(item: widget.item, tossup: detail.tossup),
              const SizedBox(height: 22),
              _SectionLabel("${(detail.record.managerName ?? widget.item.managerName ?? 'MANAGER').toUpperCase()}'S RECORD"),
              const SizedBox(height: 10),
              _RecordSummary(record: detail.record),
              const SizedBox(height: 14),
              if (detail.record.recent.isEmpty)
                _EmptyNote("No graded blunders or steals yet this season.")
              else
                ...detail.record.recent.map((e) => _RecordRow(entry: e)),
              if (widget.item.hasPlayerContext) ...[
                const SizedBox(height: 28),
                _SectionLabel('THE CASE — ARTICLES IN PLAY'),
                const SizedBox(height: 10),
                if (detail.articles.isEmpty)
                  _EmptyNote("No tagged coverage found for either player yet.")
                else
                  ...detail.articles.map((a) => _ArticleCard(article: a)),
              ],
            ],
          );
        },
      ),
    );
  }
}

// Same category -> (label, color) mapping as the Ledger card list, so the
// detail page's badge matches the card the user tapped.
const _categoryMeta = {
  'blunder': (label: 'BLUNDER', color: LT.hot),
  'steal': (label: 'STEAL', color: Color(0xFF7DD3A8)),
  'streak': (label: 'STREAK', color: Color(0xFFFFB020)),
  'toss_up': (label: 'TOSS-UP', color: Color(0xFF6FA8DC)),
};

class _TossupHeader extends StatelessWidget {
  final LedgerItem item;
  final TossupSummary tossup;
  const _TossupHeader({required this.item, required this.tossup});

  @override
  Widget build(BuildContext context) {
    final m = _categoryMeta[tossup.category] ?? _categoryMeta['blunder']!;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: LT.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: m.color, width: 1),
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
            Text('WEEK ${tossup.week}',
                style: const TextStyle(
                    fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 0.5, color: LT.textFaint)),
          ]),
          if ((tossup.managerName ?? '').isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(tossup.managerName!.toUpperCase(),
                style: LT.mono(size: 10, weight: FontWeight.w700, color: LT.accent, letterSpacing: 0.6)),
          ],
          const SizedBox(height: 8),
          Text(tossup.headline, style: LT.serif(size: 19, weight: FontWeight.w700, height: 1.25)),
          const SizedBox(height: 6),
          Text(tossup.text,
              style: LT.serif(size: 13.5, weight: FontWeight.w400, height: 1.4, color: LT.textDim, style: FontStyle.italic)),
          if (tossup.statComparison != null) ...[
            const SizedBox(height: 10),
            _StatComparisonGrid(comparison: tossup.statComparison!),
          ],
        ],
      ),
    );
  }
}

// The starter-vs-bench grid behind a blunder/steal: each player's own real
// box-score stats (yards, TDs, receptions -- never a fantasy point total),
// side by side, so the reader can see the performance gap for themselves
// instead of being told a single point differential.
class _StatComparisonGrid extends StatelessWidget {
  final StatComparison comparison;
  const _StatComparisonGrid({required this.comparison});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: LT.surfaceHi,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: LT.border),
      ),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: _StatComparisonColumn(label: 'STARTED', side: comparison.starter)),
            Container(width: 1, margin: const EdgeInsets.symmetric(horizontal: 10), color: LT.border),
            Expanded(child: _StatComparisonColumn(label: 'BENCHED', side: comparison.bench)),
          ],
        ),
      ),
    );
  }
}

class _StatComparisonColumn extends StatelessWidget {
  final String label;
  final StatComparisonSide side;
  const _StatComparisonColumn({required this.label, required this.side});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: LT.mono(size: 8.5, weight: FontWeight.w700, color: LT.textFaint, letterSpacing: 0.6)),
        const SizedBox(height: 5),
        Row(children: [
          if ((side.position ?? '').isNotEmpty) ...[
            Text(side.position!,
                style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: LT.positionColor(side.position))),
            const SizedBox(width: 4),
          ],
          Expanded(
            child: Text(side.name,
                maxLines: 1, overflow: TextOverflow.ellipsis, style: LT.serif(size: 12.5, weight: FontWeight.w700)),
          ),
        ]),
        const SizedBox(height: 8),
        if (side.stats.isEmpty)
          Text('No stat line', style: TextStyle(fontSize: 10.5, color: LT.textFaint, fontStyle: FontStyle.italic))
        else
          Wrap(
            spacing: 12,
            runSpacing: 6,
            children: side.stats.map((s) => _StatChip(stat: s)).toList(),
          ),
      ],
    );
  }
}

class _StatChip extends StatelessWidget {
  final StatLine stat;
  const _StatChip({required this.stat});

  @override
  Widget build(BuildContext context) {
    final v = stat.value;
    final display = v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(display, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: LT.text)),
        Text(stat.label, style: LT.mono(size: 8, weight: FontWeight.w600, color: LT.textFaint, letterSpacing: 0.4)),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Text(text,
          style: LT.mono(size: 11, weight: FontWeight.w700, color: LT.textFaint, letterSpacing: 1.0)),
      const SizedBox(width: 10),
      Expanded(child: Container(height: 1, color: LT.border)),
    ]);
  }
}

class _EmptyNote extends StatelessWidget {
  final String text;
  const _EmptyNote(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Text(text, style: TextStyle(color: LT.textFaint, fontSize: 13)),
    );
  }
}

class _ArticleCard extends StatelessWidget {
  final TossupArticle article;
  const _ArticleCard({required this.article});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: article.url.isNotEmpty ? () => openItem(article.url) : null,
      behavior: HitTestBehavior.opaque,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: LT.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: LT.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              if (article.players.isNotEmpty)
                Expanded(
                  child: Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: article.players
                        .map((p) => Text(
                              '${p.position ?? ''} ${p.name}'.trim(),
                              style: LT.mono(size: 10, weight: FontWeight.w700, color: LT.accent),
                            ))
                        .toList(),
                  ),
                ),
              Text(relativeTime(article.publishedAt),
                  style: const TextStyle(fontSize: 10.5, color: LT.textFaint)),
            ]),
            const SizedBox(height: 6),
            Text(article.headline,
                style: LT.serif(size: 14.5, weight: FontWeight.w700, height: 1.3)),
            if ((article.blurb ?? '').isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(article.blurb!,
                  style: LT.serif(
                      size: 12.5, weight: FontWeight.w400, height: 1.35, color: LT.textDim, style: FontStyle.italic)),
            ],
            if ((article.source ?? '').isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(article.source!.toUpperCase(),
                  style: LT.mono(size: 9.5, weight: FontWeight.w600, color: LT.textFaint, letterSpacing: 0.6)),
            ],
          ],
        ),
      ),
    );
  }
}

class _RecordSummary extends StatelessWidget {
  final ManagerRecord record;
  const _RecordSummary({required this.record});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: LT.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: LT.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            _Stat(label: 'BLUNDERS', value: record.blunders, color: LT.hot),
            const SizedBox(width: 18),
            _Stat(label: 'STEALS', value: record.steals, color: const Color(0xFF7DD3A8)),
            const SizedBox(width: 18),
            _Stat(label: 'WEEKS TRACKED', value: record.weeksTracked, color: LT.textDim),
          ]),
          const SizedBox(height: 12),
          Text(record.tendency,
              style: LT.serif(size: 13, weight: FontWeight.w400, height: 1.4, color: LT.text)),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final int value;
  final Color color;
  const _Stat({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('$value',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
        Text(label, style: LT.mono(size: 9, weight: FontWeight.w700, color: LT.textFaint, letterSpacing: 0.5)),
      ],
    );
  }
}

class _RecordRow extends StatelessWidget {
  final ManagerRecordEntry entry;
  const _RecordRow({required this.entry});

  @override
  Widget build(BuildContext context) {
    final isBlunder = entry.category == 'blunder';
    final color = isBlunder ? LT.hot : const Color(0xFF7DD3A8);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: LT.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: LT.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                border: Border.all(color: color, width: 1),
                borderRadius: BorderRadius.circular(3),
              ),
              child: Text(isBlunder ? 'BLUNDER' : 'STEAL',
                  style: LT.mono(size: 9, weight: FontWeight.w700, color: color)),
            ),
            const SizedBox(width: 8),
            Text('WEEK ${entry.week}',
                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: LT.textFaint)),
          ]),
          const SizedBox(height: 6),
          Text(entry.headline, style: LT.serif(size: 13.5, weight: FontWeight.w700, height: 1.3)),
          const SizedBox(height: 4),
          Text(entry.text,
              style: LT.serif(size: 12, weight: FontWeight.w400, height: 1.35, color: LT.textDim)),
          if (entry.statComparison != null) ...[
            const SizedBox(height: 8),
            _StatComparisonGrid(comparison: entry.statComparison!),
          ],
        ],
      ),
    );
  }
}
