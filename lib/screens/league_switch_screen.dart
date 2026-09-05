import 'package:flutter/material.dart';

import '../models/sleeper_models.dart';
import '../services/league_session.dart';
import '../services/session_store.dart';
import '../services/sleeper_service.dart';
import '../theme.dart';
import 'home_shell.dart';
import 'onboarding_screen.dart';

/// Lets the signed-in Sleeper user jump to a different one of their leagues,
/// or back out to onboarding entirely for a different Sleeper account.
class LeagueSwitchScreen extends StatefulWidget {
  final String username;
  final String userId;
  final String currentLeagueId;

  const LeagueSwitchScreen({
    super.key,
    required this.username,
    required this.userId,
    required this.currentLeagueId,
  });

  @override
  State<LeagueSwitchScreen> createState() => _LeagueSwitchScreenState();
}

class _LeagueSwitchScreenState extends State<LeagueSwitchScreen> {
  final _sleeper = SleeperService();

  bool _loading = true;
  bool _switching = false;
  String? _error;
  List<SleeperLeague> _leagues = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final season = await _sleeper.getCurrentSeason();
      final leagues = await _sleeper.getLeagues(widget.userId, season);
      setState(() => _leagues = leagues);
    } catch (e) {
      setState(() => _error = 'Couldn\'t load your leagues. Check your connection and try again.');
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _selectLeague(SleeperLeague league) async {
    if (league.leagueId == widget.currentLeagueId) {
      Navigator.of(context).pop();
      return;
    }
    setState(() => _switching = true);
    try {
      final loaded = await loadLeagueForUser(
        sleeper: _sleeper,
        userId: widget.userId,
        leagueId: league.leagueId,
        leagueName: league.name,
      );
      await SessionStore.save(
        username: widget.username,
        userId: widget.userId,
        leagueId: loaded.leagueId,
        leagueName: loaded.leagueName,
      );
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(
          builder: (_) => HomeShell(
            username: widget.username,
            leagueName: loaded.leagueName,
            leagueId: loaded.leagueId,
            userId: loaded.userId,
            teamName: loaded.teamName,
            playerIds: loaded.playerIds,
            starterIds: loaded.starterIds,
            leaguePlayerIds: loaded.leaguePlayerIds,
          ),
        ),
        (route) => false,
      );
    } catch (e) {
      setState(() {
        _switching = false;
        _error = 'Couldn\'t switch leagues. Check your connection and try again.';
      });
    }
  }

  Future<void> _switchAccount() async {
    await SessionStore.clear();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const OnboardingScreen()),
      (route) => false,
    );
  }

  @override
  void dispose() {
    _sleeper.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: LT.bg,
      appBar: AppBar(
        backgroundColor: LT.bg,
        elevation: 0,
        title: const Text('Switch League',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
      ),
      body: SafeArea(
        child: Stack(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Signed in as ${widget.username}',
                      style: const TextStyle(fontSize: 13, color: LT.textFaint)),
                  const SizedBox(height: 18),
                  if (_error != null) ...[
                    Text(_error!, style: const TextStyle(color: LT.hot)),
                    const SizedBox(height: 16),
                  ],
                  Expanded(
                    child: _loading
                        ? const Center(child: CircularProgressIndicator(color: LT.accent))
                        : ListView.separated(
                            itemCount: _leagues.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 10),
                            itemBuilder: (_, i) {
                              final l = _leagues[i];
                              final isCurrent = l.leagueId == widget.currentLeagueId;
                              return InkWell(
                                borderRadius: BorderRadius.circular(14),
                                onTap: _switching ? null : () => _selectLeague(l),
                                child: Container(
                                  padding: const EdgeInsets.all(18),
                                  decoration: BoxDecoration(
                                    color: isCurrent ? LT.accent.withOpacity(0.10) : LT.surface,
                                    borderRadius: BorderRadius.circular(14),
                                    border: Border.all(
                                        color: isCurrent ? LT.accent : LT.border),
                                  ),
                                  child: Row(children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(l.name,
                                              style: const TextStyle(
                                                  fontSize: 16,
                                                  fontWeight: FontWeight.w700)),
                                          const SizedBox(height: 4),
                                          Text('${l.totalRosters} teams · ${l.season}',
                                              style: const TextStyle(
                                                  fontSize: 13, color: LT.textDim)),
                                        ],
                                      ),
                                    ),
                                    if (isCurrent)
                                      const Text('CURRENT',
                                          style: TextStyle(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w700,
                                              color: LT.accent,
                                              letterSpacing: 0.4))
                                    else
                                      const Icon(Icons.chevron_right, color: LT.textFaint),
                                  ]),
                                ),
                              );
                            },
                          ),
                  ),
                  const SizedBox(height: 12),
                  Center(
                    child: TextButton(
                      onPressed: _switching ? null : _switchAccount,
                      child: const Text('Not you? Sign in with a different Sleeper account',
                          style: TextStyle(color: LT.textDim, fontSize: 13)),
                    ),
                  ),
                ],
              ),
            ),
            if (_switching)
              Container(
                color: LT.bg.withOpacity(0.7),
                child: const Center(child: CircularProgressIndicator(color: LT.accent)),
              ),
          ],
        ),
      ),
    );
  }
}
