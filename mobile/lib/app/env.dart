import 'package:flutter_dotenv/flutter_dotenv.dart';

class AppEnv {
  const AppEnv._();
  static String _read(String name, String defined) {
    final value = defined.isNotEmpty ? defined : dotenv.env[name] ?? '';
    if (value.trim().isEmpty) {
      throw StateError(
        'Missing $name. Set it in mobile/.env or --dart-define.',
      );
    }
    return value.trim();
  }

  static String get apiBaseUrl =>
      _read('API_BASE_URL', const String.fromEnvironment('API_BASE_URL'));
  static String get webBaseUrl =>
      _read('WEB_BASE_URL', const String.fromEnvironment('WEB_BASE_URL'));
  static String get supabaseUrl =>
      _read('SUPABASE_URL', const String.fromEnvironment('SUPABASE_URL'));
  static String get supabaseAnonKey => _read(
    'SUPABASE_ANON_KEY',
    const String.fromEnvironment('SUPABASE_ANON_KEY'),
  );
  static bool get judgeMode {
    const defined = String.fromEnvironment('HACKATHON_JUDGE_MODE');
    return (defined.isNotEmpty
                ? defined
                : dotenv.env['HACKATHON_JUDGE_MODE'] ?? 'false')
            .toLowerCase() ==
        'true';
  }

  static void validate() {
    for (final url in [apiBaseUrl, webBaseUrl, supabaseUrl]) {
      final parsed = Uri.tryParse(url);
      if (parsed == null ||
          !['http', 'https'].contains(parsed.scheme) ||
          parsed.host.isEmpty) {
        throw StateError('Invalid URL in mobile environment: $url');
      }
    }
    if (!apiBaseUrl.endsWith('/api/v1')) {
      throw StateError('API_BASE_URL must end with /api/v1.');
    }
    if (webBaseUrl.endsWith('/api/v1')) {
      throw StateError('WEB_BASE_URL must be the web origin.');
    }
    final web = Uri.parse(webBaseUrl);
    if (web.path.isNotEmpty && web.path != '/') {
      throw StateError('WEB_BASE_URL must be the web origin without a path.');
    }
    supabaseAnonKey;
  }
}
