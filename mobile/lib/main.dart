import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:app/core/telemetry/app_logger.dart';
import 'package:app/app/app.dart';
import 'package:app/core/auth/supabase_auth_repository.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  try {
    await dotenv.load(fileName: '.env');
  } catch (e) {
    debugPrint('.env file not found, falling back to --dart-define or environment variables.');
  }
  await SupabaseAuthRepository.initialize();

  try {
    await Firebase.initializeApp();
    FlutterError.onError = (errorDetails) {
      AppLogger.recordFlutterFatalError(errorDetails);
    };
    PlatformDispatcher.instance.onError = (error, stack) {
      AppLogger.recordError(error, stack, reason: 'Platform Error');
      return true;
    };
  } catch (e) {
    debugPrint('Firebase initialization failed (likely missing google-services.json): $e');
  }

  runApp(
    const ProviderScope(
      overrides: [
        // We can override the database provider here if needed
      ],
      child: RecallStackApp(),
    ),
  );
}
