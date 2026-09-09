import 'package:flutter/material.dart';

import '../models/ledger_models.dart';
import '../models/tossup_detail_models.dart';
import '../services/ledger_service.dart';
import '../theme.dart';
import 'feed_screen.dart' show relativeTime, openItem;

// The page a "toss_up" Ledger card opens into: the articles actually behind
// that specific decision (upper half), and the manager's aggregated Ledger
// decision record in this league (lower half) -- so the toss-up isn't shown
// in a vacuum.
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
              _SectionLabel('THE CASE — ARTICLES IN PLAY'),
              const SizedBox(height: 10),
              if (detail.articles.isEmpty)
                _EmptyNote("No tagged coverage found for either player yet.")
              else
                ...detail.articles.map((a) => _ArticleCard(article: a)),
              const SizedBox(height: 28),
              _SectionLabel("${(detail.record.managerName ?? widget.item.managerName ?? 'MANAGER').toUpperCase()}'S RECORD"),
              const SizedBox(height: 10),
              _RecordSummary(record: detail.record),
              const SizedBox(height: 14),
              if (detail.record.recent.isEmpty)
                _EmptyNote("No graded blunders or steals yet this season.")
              else
                ...detail.record.recent.map((e) => _RecordRow(entry: e)),
            ],
          );
        },
      ),
    );
  }
}

class _TossupHeader extends StatelessWidget {
  final LedgerItem item;
  final TossupSummary tossup;
  const _TossupHeader({required this.item, required this.tossup});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: LT.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF6FA8DC), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                border: Border.all(color: const Color(0xFF6FA8DC), width: 1),
                borderRadius: BorderRadius.circular(3),
              ),
              child: Text('TOSS-UP',
                  style: LT.mono(size: 9.5, weight: FontWeight.w700, color: const Color(0xFF6FA8DC))),
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
        ],
      ),
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
        ],
      ),
    );
  }
}
