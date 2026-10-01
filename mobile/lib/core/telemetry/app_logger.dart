import 'package:flutter/foundation.dart';
import '../reasonai/reasonai_events.dart';

class AppLogger {
  const AppLogger._();
  static void error(Object error) {
    if (error is ProtocolError) {
      debugPrint('ReasonAI protocol error: ${error.reason}');
    } else {
      debugPrint('ReasonAI error: ${error.runtimeType}');
    }
  }
}
