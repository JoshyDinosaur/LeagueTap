// Persists "who is signed in and which league are they viewing" across app
// launches, so LeagueTap doesn't ask for a Sleeper username every cold start.
// Deliberately tiny — just enough to skip onboarding and restore HomeShell.

import 'package:shared_preferences/shared_preferences.dart';

class SavedSession {
  final String username;
  final String userId;
  final String leagueId;
  final String leagueName;

  SavedSession({
    required this.username,
    required this.userId,
    required this.leagueId,
    required this.leagueName,
  });
}

class SessionStore {
  static const _kUsername = 'lt_username';
  static const _kUserId = 'lt_user_id';
  static const _kLeagueId = 'lt_league_id';
  static const _kLeagueName = 'lt_league_name';

  static Future<void> save({
    required String username,
    required String userId,
    required String leagueId,
    required String leagueName,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kUsername, username);
    await prefs.setString(_kUserId, userId);
    await prefs.setString(_kLeagueId, leagueId);
    await prefs.setString(_kLeagueName, leagueName);
  }

  static Future<SavedSession?> load() async {
    final prefs = await SharedPreferences.getInstance();
    final username = prefs.getString(_kUsername);
    final userId = prefs.getString(_kUserId);
    final leagueId = prefs.getString(_kLeagueId);
    final leagueName = prefs.getString(_kLeagueName);
    if (username == null || userId == null || leagueId == null || leagueName == null) {
      return null;
    }
    return SavedSession(
      username: username,
      userId: userId,
      leagueId: leagueId,
      leagueName: leagueName,
    );
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kUsername);
    await prefs.remove(_kUserId);
    await prefs.remove(_kLeagueId);
    await prefs.remove(_kLeagueName);
  }
}
