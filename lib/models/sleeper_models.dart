// Data models for the Sleeper API responses LeagueTap uses.
// All fields are tolerant of missing/null data — Sleeper omits keys freely.

class SleeperUser {
  final String userId;
  final String username;
  final String displayName;
  final String? avatar;

  SleeperUser({
    required this.userId,
    required this.username,
    required this.displayName,
    this.avatar,
  });

  factory SleeperUser.fromJson(Map<String, dynamic> json) {
    return SleeperUser(
      userId: json['user_id']?.toString() ?? '',
      username: json['username']?.toString() ?? '',
      displayName: json['display_name']?.toString() ?? '',
      avatar: json['avatar']?.toString(),
    );
  }
}

class SleeperLeague {
  final String leagueId;
  final String name;
  final String season;
  final int totalRosters;
  final Map<String, dynamic> scoringSettings;
  final List<String> rosterPositions;

  SleeperLeague({
    required this.leagueId,
    required this.name,
    required this.season,
    required this.totalRosters,
    required this.scoringSettings,
    required this.rosterPositions,
  });

  factory SleeperLeague.fromJson(Map<String, dynamic> json) {
    return SleeperLeague(
      leagueId: json['league_id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Unnamed League',
      season: json['season']?.toString() ?? '',
      totalRosters: (json['total_rosters'] as num?)?.toInt() ?? 0,
      scoringSettings:
          (json['scoring_settings'] as Map?)?.cast<String, dynamic>() ?? {},
      rosterPositions:
          (json['roster_positions'] as List?)?.map((e) => e.toString()).toList() ??
              const [],
    );
  }
}

class SleeperRoster {
  final int rosterId;
  final String? ownerId;
  final List<String> playerIds; // all players on the roster
  final List<String> starters; // starting lineup player ids
  final int wins;
  final int losses;
  final int ties;

  SleeperRoster({
    required this.rosterId,
    required this.ownerId,
    required this.playerIds,
    required this.starters,
    this.wins = 0,
    this.losses = 0,
    this.ties = 0,
  });

  factory SleeperRoster.fromJson(Map<String, dynamic> json) {
    final s = (json['settings'] as Map?)?.cast<String, dynamic>() ?? {};
    return SleeperRoster(
      rosterId: (json['roster_id'] as num?)?.toInt() ?? -1,
      ownerId: json['owner_id']?.toString(),
      playerIds:
          (json['players'] as List?)?.map((e) => e.toString()).toList() ??
              const [],
      starters:
          (json['starters'] as List?)?.map((e) => e.toString()).toList() ??
              const [],
      wins: (s['wins'] as num?)?.toInt() ?? 0,
      losses: (s['losses'] as num?)?.toInt() ?? 0,
      ties: (s['ties'] as num?)?.toInt() ?? 0,
    );
  }

  String get record => '$wins-$losses${ties > 0 ? '-$ties' : ''}';
}

/// A league member (manager). team_name lives under metadata.
class SleeperLeagueUser {
  final String userId;
  final String displayName;
  final String? teamName;
  final String? avatar;

  SleeperLeagueUser({
    required this.userId,
    required this.displayName,
    this.teamName,
    this.avatar,
  });

  factory SleeperLeagueUser.fromJson(Map<String, dynamic> json) {
    final meta = (json['metadata'] as Map?)?.cast<String, dynamic>() ?? {};
    return SleeperLeagueUser(
      userId: json['user_id']?.toString() ?? '',
      displayName: json['display_name']?.toString() ?? 'Manager',
      teamName: meta['team_name']?.toString(),
      avatar: json['avatar']?.toString(),
    );
  }

  String get name => teamName?.isNotEmpty == true ? teamName! : displayName;
}

/// A single team's entry in a weekly matchup.
class SleeperMatchupEntry {
  final int rosterId;
  final int? matchupId;
  final List<String> starters;
  final double points;

  SleeperMatchupEntry({
    required this.rosterId,
    required this.matchupId,
    required this.starters,
    required this.points,
  });

  factory SleeperMatchupEntry.fromJson(Map<String, dynamic> json) {
    return SleeperMatchupEntry(
      rosterId: (json['roster_id'] as num?)?.toInt() ?? -1,
      matchupId: (json['matchup_id'] as num?)?.toInt(),
      starters:
          (json['starters'] as List?)?.map((e) => e.toString()).toList() ??
              const [],
      points: (json['points'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

/// Current NFL season state.
class NflState {
  final String season;
  final int week;
  final String seasonType; // pre | regular | post | off

  NflState({required this.season, required this.week, required this.seasonType});

  factory NflState.fromJson(Map<String, dynamic> json) => NflState(
        season: json['season']?.toString() ?? '',
        week: (json['week'] as num?)?.toInt() ?? 0,
        seasonType: json['season_type']?.toString() ?? 'off',
      );

  bool get inSeason => seasonType == 'regular' || seasonType == 'post';
}

/// Minimal player record from the giant /players/nfl map.
class SleeperPlayer {
  final String playerId;
  final String fullName;
  final String? team;
  final String? position;
  final String? searchFullName; // normalized, lowercase, no punctuation

  SleeperPlayer({
    required this.playerId,
    required this.fullName,
    this.team,
    this.position,
    this.searchFullName,
  });

  factory SleeperPlayer.fromJson(String id, Map<String, dynamic> json) {
    final first = json['first_name']?.toString() ?? '';
    final last = json['last_name']?.toString() ?? '';
    final full = (json['full_name']?.toString() ?? '$first $last').trim();
    return SleeperPlayer(
      playerId: id,
      fullName: full,
      team: json['team']?.toString(),
      position: json['position']?.toString(),
      searchFullName: json['search_full_name']?.toString(),
    );
  }
}
