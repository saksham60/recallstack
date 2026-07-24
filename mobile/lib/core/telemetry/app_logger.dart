import 'package:flutter/foundation.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';

class AppLogger {
  static Future<void> recordError(
    dynamic exception,
    StackTrace? stack, {
    String? reason,
  }) async {
    if (kDebugMode) {
      print('==================== APP ERROR ====================');
      if (reason != null) {
        print('Reason: $reason');
      }
      print('Exception: $exception');
      if (stack != null) {
        print('Stacktrace:\n$stack');
      }
      print('===================================================');
    }

    try {
      await FirebaseCrashlytics.instance.recordError(
        exception,
        stack,
        reason: reason,
        fatal: false, // Set to true if app state is unrecoverable
      );
    } catch (e) {
      // Ignore if crashlytics is not initialized properly
    }
  }

  static Future<void> recordFlutterFatalError(
    FlutterErrorDetails errorDetails,
  ) async {
    if (kDebugMode) {
      print('==================== FLUTTER FATAL ERROR ====================');
      print('Exception: ${errorDetails.exception}');
      if (errorDetails.stack != null) {
        print('Stacktrace:\n${errorDetails.stack}');
      }
      print('=============================================================');
    }

    try {
      await FirebaseCrashlytics.instance.recordFlutterFatalError(errorDetails);
    } catch (e) {
      // Ignore
    }
  }

  static Future<void> log(String message) async {
    if (kDebugMode) {
      print('APP LOG: $message');
    }

    try {
      await FirebaseCrashlytics.instance.log(message);
    } catch (e) {
      // Ignore
    }
  }
}
