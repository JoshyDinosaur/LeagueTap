// App configuration. The anon/publishable key is safe to ship in a client.
// Secrets (service role, Anthropic) live ONLY in Edge Functions — never here.
class AppConfig {
  static const String supabaseUrl = 'https://ducyqpybwyfoicylfflq.supabase.co';

  // Paste your anon / publishable key here (Settings → API Keys).
  static const String supabaseAnonKey =
      'sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0';

  // Offseason mode: when true, blurbs avoid upcoming-matchup / start-sit framing
  // (games are too far away) and lean on roster value, role, and season-long
  // implications. Users can flip this in the "For Your Team" panel. This is the
  // default the toggle starts from.
  static const bool offseasonModeDefault = true;
}
