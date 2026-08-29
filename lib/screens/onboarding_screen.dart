import 'package:flutter/material.dart';

import '../models/sleeper_models.dart';
import '../services/sleeper_service.dart';
import '../theme.dart';
import 'home_shell.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _sleeper = SleeperService();
  // Pre-filled for now to speed up testing/demo.
  final _controller = TextEditingController(text: 'Still_just_josh');

  bool _loading = false;
  String? _error;
  SleeperUser? _user;
  String _season = '';
  List<SleeperLeague> _leagues = const [];

  Future<void> _findLeagues() async {
    final username = _controller.text.trim();
    if (username.isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      _season = await _sleeper.getCurrentSeason();
      final user = await _sleeper.getUserByUsername(username);
      if (user == null) {
        setState(() => _error = 'No Sleeper user "$username" found.');
        return;
      }
      final leagues = await _sleeper.getLeagues(user.userId, _season);
      setState(() {
        _user = user;
        _leagues = leagues;
        if (leagues.isEmpty) _error = 'No $_season leagues on this account.';
      });
    } catch (e) {
      setState(() => _error = 'Something went wrong. Try again.');
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _openLeague(SleeperLeague league) async {
    setState(() => _loading = true);
    try {
      // One rosters call gives us both my roster and the league-wide pool.
      final rosters = await _sleeper.getRosters(league.leagueId);
      final mine = rosters.where((r) => r.ownerId == _user!.userId).toList();
      final myIds = mine.isNotEmpty ? mine.first.playerIds : const <String>[];
      final myStarters = mine.isNotEmpty ? mine.first.starters : const <String>[];
      final leagueIds =
          rosters.expand((r) => r.playerIds).toSet().toList();
      // Resolve the manager's fantasy team name (metadata.team_name).
      String? teamName;
      try {
        final users = await _sleeper.getLeagueUsers(league.leagueId);
        final me = users.where((u) => u.userId == _user!.userId).toList();
        teamName = me.isNotEmpty ? me.first.name : null;
      } catch (_) {
        teamName = null;
      }
      if (!mounted) return;
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => HomeShell(
          leagueName: league.name,
          leagueId: league.leagueId,
          userId: _user!.userId,
          teamName: teamName,
          playerIds: myIds,
          starterIds: myStarters,
          leaguePlayerIds: leagueIds,
        ),
      ));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(28, 48, 28, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Container(
                  width: 10,
                  height: 28,
                  decoration: BoxDecoration(
                    color: LT.accent,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
                const SizedBox(width: 12),
                const Text('LeagueTap',
                    style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5)),
              ]),
              const SizedBox(height: 14),
              const Text(
                'NFL news, seen through your team.',
                style: TextStyle(fontSize: 16, color: LT.textDim),
              ),
              const SizedBox(height: 40),
              const Text('Your Sleeper username',
                  style: TextStyle(
                      fontSize: 13,
                      color: LT.textFaint,
                      fontWeight: FontWeight.w600)),
              const SizedBox(height: 10),
              TextField(
                controller: _controller,
                autocorrect: false,
                style: const TextStyle(fontSize: 17, color: LT.text),
                onSubmitted: (_) => _findLeagues(),
                decoration: InputDecoration(
                  hintText: 'e.g. Still_just_josh',
                  hintStyle: const TextStyle(color: LT.textFaint),
                  filled: true,
                  fillColor: LT.surface,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: const BorderSide(color: LT.border),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: const BorderSide(color: LT.accent, width: 1.5),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: LT.accent,
                    foregroundColor: Colors.black,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                  ),
                  onPressed: _loading ? null : _findLeagues,
                  child: _loading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.black))
                      : const Text('Find my leagues',
                          style: TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w700)),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(_error!, style: const TextStyle(color: LT.hot)),
              ],
              const SizedBox(height: 28),
              if (_leagues.isNotEmpty)
                const Text('Choose a league',
                    style: TextStyle(
                        fontSize: 13,
                        color: LT.textFaint,
                        fontWeight: FontWeight.w600)),
              const SizedBox(height: 10),
              Expanded(
                child: ListView.separated(
                  itemCount: _leagues.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final l = _leagues[i];
                    return InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: _loading ? null : () => _openLeague(l),
                      child: Container(
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          color: LT.surface,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: LT.border),
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
                                ]),
                          ),
                          const Icon(Icons.chevron_right, color: LT.textFaint),
                        ]),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
