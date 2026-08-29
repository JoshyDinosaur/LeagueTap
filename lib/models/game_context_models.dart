/// Per-NFL-team game context from the game-context Edge Function.
class GameContext {
  final String? opp;
  final String? homeAway; // home | away
  final DateTime? kickoff;
  final bool bye;
  final String? weatherLabel; // Clear | Rain | Snow | Windy | Cold | Indoor
  final String? weatherIcon;
  final int? tempF;
  final String? difficultyLabel; // Easy | Medium | Tough
  final String? difficultyTier; // easy | medium | tough

  GameContext({
    this.opp,
    this.homeAway,
    this.kickoff,
    this.bye = false,
    this.weatherLabel,
    this.weatherIcon,
    this.tempF,
    this.difficultyLabel,
    this.difficultyTier,
  });

  factory GameContext.fromJson(Map<String, dynamic> j) {
    final w = (j['weather'] as Map?)?.cast<String, dynamic>();
    final d = (j['difficulty'] as Map?)?.cast<String, dynamic>();
    return GameContext(
      opp: j['opp']?.toString(),
      homeAway: j['homeAway']?.toString(),
      kickoff: DateTime.tryParse(j['kickoff']?.toString() ?? ''),
      bye: j['bye'] == true,
      weatherLabel: w?['label']?.toString(),
      weatherIcon: w?['icon']?.toString(),
      tempF: (w?['tempF'] as num?)?.toInt(),
      difficultyLabel: d?['label']?.toString(),
      difficultyTier: d?['tier']?.toString(),
    );
  }
}
