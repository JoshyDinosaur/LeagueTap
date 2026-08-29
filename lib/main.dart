import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'screens/splash_screen.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(
    url: AppConfig.supabaseUrl,
    anonKey: AppConfig.supabaseAnonKey,
  );
  runApp(const LeagueTapApp());
}

class LeagueTapApp extends StatelessWidget {
  const LeagueTapApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LeagueTap',
      debugShowCheckedModeBanner: false,
      theme: LT.theme(),
      home: const SplashScreen(),
    );
  }
}
