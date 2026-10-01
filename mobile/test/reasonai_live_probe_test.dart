import 'package:app/core/auth/auth_repository.dart';
import 'package:app/core/reasonai/reasonai_client.dart';
import 'package:app/core/reasonai/reasonai_stream.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

// Opt in with --dart-define=LIVE_REASONAI_PROBE=true and the mobile build defines.
void main() {
  const enabled = bool.fromEnvironment('LIVE_REASONAI_PROBE');
  test(
    'live authenticated empty Feed request reaches schema validation',
    () async {
      const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
      const supabaseKey = String.fromEnvironment('SUPABASE_ANON_KEY');
      const webBaseUrl = String.fromEnvironment('WEB_BASE_URL');
      expect(supabaseUrl, isNotEmpty);
      expect(supabaseKey, isNotEmpty);
      expect(webBaseUrl, isNotEmpty);

      final client = SupabaseClient(
        supabaseUrl,
        supabaseKey,
        authOptions: const AuthClientOptions(autoRefreshToken: false),
      );
      try {
        final auth = AuthRepository(client);
        await auth.signInAsJudge();
        final dio = createReasonAIDio(webBaseUrl, auth);
        await expectLater(
          const ReasonAIStream()
              .open(
                dio: dio,
                path: feedReasonAIPath,
                body: {},
                token: CancelToken(),
              )
              .toList(),
          throwsA(
            isA<ReasonAIHttpException>()
                .having((error) => error.statusCode, 'status', 400)
                .having(
                  (error) => error.message,
                  'message',
                  contains('Invalid or oversized story conversation'),
                ),
          ),
        );
        await expectLater(
          const ReasonAIStream()
              .open(
                dio: dio,
                path: dsaReasonAIPath,
                body: {},
                token: CancelToken(),
              )
              .toList(),
          throwsA(
            isA<ReasonAIHttpException>().having(
              (error) => error.statusCode,
              'status',
              400,
            ),
          ),
        );
      } finally {
        await client.dispose();
      }
    },
    skip: !enabled,
  );
}
