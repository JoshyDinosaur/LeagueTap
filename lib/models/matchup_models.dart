import 'feed_models.dart' show MyPlayer;

/// One side of a fantasy matchup.
class TeamSide {
  final String name;
  final String record;
  final List<MyPlayer> starters;

  TeamSide({required this.name, required this.record, required this.starters});
}

/// Everything the Gameplan tab needs for the upcoming matchup.
class MatchupContext {
  final int week;
  final String seasonType; // pre | regular | post | off
  final bool hasMatchup; // false in the offseason / before schedule is set
  final TeamSide me;
  final TeamSide? opponent;

  MatchupContext({
    required this.week,
    required this.seasonType,
    required this.hasMatchup,
    required this.me,
    required this.opponent,
  });
}
