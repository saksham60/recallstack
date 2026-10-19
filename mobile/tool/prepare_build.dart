import 'dart:convert';
import 'dart:io';

/// Writes only public client configuration. Never consume server environment keys.
void main(List<String> args) {
  const names = [
    'API_BASE_URL',
    'WEB_BASE_URL',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
  ];
  final input = args.contains('--ci')
      ? {
          for (final name in names)
            name: Platform.environment['MOBILE_$name'] ?? '',
        }
      : Map<String, dynamic>.from(
          jsonDecode(
                File(
                  args.isEmpty ? 'build/production-defines.json' : args.first,
                ).readAsStringSync(),
              )
              as Map,
        );
  final config = <String, String>{
    for (final name in names) name: (input[name] as String? ?? '').trim(),
  };
  for (final name in names.take(3)) {
    final url = Uri.tryParse(config[name]!);
    if (url == null ||
        url.scheme != 'https' ||
        url.host.isEmpty ||
        ['localhost', '10.0.2.2', '127.0.0.1'].contains(url.host) ||
        url.userInfo.isNotEmpty) {
      throw StateError('Production HTTPS configuration is required for $name.');
    }
  }
  if (!config['API_BASE_URL']!.endsWith('/api/v1')) {
    throw StateError('API_BASE_URL must include /api/v1.');
  }
  final web = Uri.parse(config['WEB_BASE_URL']!);
  if (web.path.isNotEmpty && web.path != '/') {
    throw StateError('WEB_BASE_URL must be an origin.');
  }
  final key = config['SUPABASE_ANON_KEY']!;
  if (!key.startsWith('sb_publishable_')) {
    try {
      final payload =
          jsonDecode(
                utf8.decode(
                  base64Url.decode(base64Url.normalize(key.split('.')[1])),
                ),
              )
              as Map;
      if (payload['role'] != 'anon') {
        throw const FormatException('Not an anon key');
      }
    } catch (_) {
      throw StateError(
        'Use a public Supabase publishable/anon key; server credentials are forbidden.',
      );
    }
  }
  final git = Process.runSync('git', ['rev-parse', 'HEAD']);
  final sha = git.stdout.toString().trim();
  if (git.exitCode != 0 || !RegExp(r'^[a-f0-9]{40}$').hasMatch(sha)) {
    throw StateError('Cannot determine the source SHA.');
  }
  config['BUILD_SHA'] = sha;
  config['HACKATHON_JUDGE_MODE'] = 'false';
  Directory('build').createSync(recursive: true);
  File('build/verified-defines.json').writeAsStringSync(jsonEncode(config));
  stdout.writeln(
    'Validated production public client configuration; source $sha; judge mode disabled.',
  );
}
