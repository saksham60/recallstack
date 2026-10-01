import 'dart:typed_data';

import 'package:app/core/auth/auth_repository.dart';
import 'package:app/core/reasonai/reasonai_client.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _Auth extends AuthRepository {
  _Auth()
    : super(
        SupabaseClient(
          'https://example.supabase.co',
          'anon',
          authOptions: const AuthClientOptions(autoRefreshToken: false),
        ),
      );

  String? accessToken = 'first-token';
  int signOuts = 0;

  @override
  Session? get current => accessToken == null
      ? null
      : Session(
          accessToken: accessToken!,
          tokenType: 'bearer',
          user: const User(
            id: 'learner',
            appMetadata: {},
            userMetadata: null,
            aud: 'authenticated',
            createdAt: '',
          ),
        );

  @override
  Future<void> signOut() async => signOuts++;
}

class _Adapter implements HttpClientAdapter {
  _Adapter(this.status);
  final int status;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      status == 200 ? '{"ok":true}' : '{"error":"Session expired."}',
      status,
      headers: {
        'content-type': ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _RedirectAdapter implements HttpClientAdapter {
  _RedirectAdapter(this.location);
  final String location;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    if (options.uri.host == 'reasonai.tech') {
      return ResponseBody.fromString(
        'Redirecting',
        308,
        headers: {
          'location': [location],
          'content-type': ['text/plain'],
        },
      );
    }
    return ResponseBody.fromString(
      '{"ok":true}',
      200,
      headers: {
        'content-type': ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  test(
    'ReasonAI uses Vercel URLs and the current token on each request',
    () async {
      final auth = _Auth();
      final dio = createReasonAIDio('https://reasonai.tech', auth);
      final adapter = _Adapter(200);
      dio.httpClientAdapter = adapter;

      await dio.post<Map<String, dynamic>>(feedReasonAIPath, data: {});
      auth.accessToken = 'new-token';
      await dio.post<Map<String, dynamic>>(dsaReasonAIPath, data: {});

      expect(adapter.requests.map((request) => request.uri.toString()), [
        'https://reasonai.tech/api/reasonai/knowledge/chat',
        'https://reasonai.tech/api/reasonai/dsa/chat',
      ]);
      expect(
        adapter.requests.first.headers['Authorization'],
        'Bearer first-token',
      );
      expect(
        adapter.requests.last.headers['Authorization'],
        'Bearer new-token',
      );
      expect(adapter.requests.first.headers['Accept'], 'application/x-ndjson');
      expect(dio.options.connectTimeout, const Duration(seconds: 15));
      expect(dio.options.receiveTimeout, const Duration(seconds: 120));
    },
  );

  test('ReasonAI 401 never signs the user out', () async {
    final auth = _Auth();
    final dio = createReasonAIDio('https://reasonai.tech', auth);
    dio.httpClientAdapter = _Adapter(401);

    await expectLater(
      dio.post<dynamic>(feedReasonAIPath, data: {}),
      throwsA(isA<DioException>()),
    );
    expect(auth.signOuts, 0);
  });

  test('canonical Vercel redirect preserves POST and bearer token', () async {
    final auth = _Auth();
    final dio = createReasonAIDio('https://reasonai.tech', auth);
    final adapter = _RedirectAdapter(
      'https://www.reasonai.tech/api/reasonai/knowledge/chat',
    );
    dio.httpClientAdapter = adapter;

    await dio.post<dynamic>(feedReasonAIPath, data: {'message': 'hello'});

    expect(adapter.requests.map((request) => request.uri.host), [
      'reasonai.tech',
      'www.reasonai.tech',
    ]);
    expect(
      adapter.requests.every((request) => request.method == 'POST'),
      isTrue,
    );
    expect(
      adapter.requests.every(
        (request) => request.headers['Authorization'] == 'Bearer first-token',
      ),
      isTrue,
    );
  });

  test(
    'ReasonAI does not forward a bearer token to another redirect host',
    () async {
      final dio = createReasonAIDio('https://reasonai.tech', _Auth());
      final adapter = _RedirectAdapter('https://example.com/steal');
      dio.httpClientAdapter = adapter;

      await expectLater(
        dio.post<dynamic>(feedReasonAIPath, data: {}),
        throwsA(isA<DioException>()),
      );
      expect(adapter.requests, hasLength(1));
    },
  );

  test('ReasonAI requires a valid WEB_BASE_URL', () {
    expect(() => createReasonAIDio('', _Auth()), throwsStateError);
  });
}
