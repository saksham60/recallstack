import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'dart:convert';
import 'package:flutter/foundation.dart';

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

  static const buildSha = String.fromEnvironment(
    'BUILD_SHA',
    defaultValue: 'development',
  );
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
    if (kReleaseMode || kProfileMode) {
      if (judgeMode) {
        throw StateError('Judge mode is not allowed in production builds.');
      }
      for (final url in [apiBaseUrl, webBaseUrl, supabaseUrl]) {
        final uri = Uri.parse(url);
        if (uri.scheme != 'https' ||
            uri.host == 'localhost' ||
            uri.host == '10.0.2.2' ||
            uri.host == '127.0.0.1' ||
            uri.userInfo.isNotEmpty) {
          throw StateError(
            'Production endpoints require HTTPS public origins.',
          );
        }
      }
      final key = supabaseAnonKey;
      if (!key.startsWith('sb_publishable_')) {
        try {
          final parts = key.split('.');
          final payload =
              jsonDecode(
                    utf8.decode(
                      base64Url.decode(base64Url.normalize(parts[1])),
                    ),
                  )
                  as Map;
          if (payload['role'] != 'anon') {
            throw const FormatException('Not a public anon key.');
          }
        } catch (_) {
          throw StateError(
            'Production requires a public Supabase publishable/anon key.',
          );
        }
      }
      if (!RegExp(r'^[a-f0-9]{40}$').hasMatch(buildSha)) {
        throw StateError(
          'Production BUILD_SHA must identify the source commit.',
        );
      }
    }
  }
}
