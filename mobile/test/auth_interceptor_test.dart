import 'dart:typed_data';
import 'package:app/core/api/api_client.dart';
import 'package:app/core/auth/auth_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _Auth extends AuthRepository {
  _Auth() : super(SupabaseClient('https://example.supabase.co', 'anon'));
  String token = 'old';
  int refreshes = 0, signOuts = 0;
  bool canRefresh = true;
  @override
  Session? get current => Session(
    accessToken: token,
    tokenType: 'bearer',
    user: const User(
      id: 'u',
      appMetadata: {},
      userMetadata: null,
      aud: 'authenticated',
      createdAt: '',
    ),
  );
  @override
  Future<bool> refreshSession() async {
    refreshes++;
    if (!canRefresh) return false;
    token = 'new';
    return true;
  }

  @override
  Future<void> signOut() async {
    signOuts++;
  }
}

class _Adapter implements HttpClientAdapter {
  _Adapter(this.statusFor);
  final int Function(RequestOptions) statusFor;
  final requests = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      '{"ok":true}',
      statusFor(options),
      headers: {
        'content-type': ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  test('401 refreshes token and retries one request', () async {
    final auth = _Auth();
    final dio = createApiDio('https://example.com/api/v1', auth);
    final adapter = _Adapter(
      (options) => options.headers['Authorization'] == 'Bearer new' ? 200 : 401,
    );
    dio.httpClientAdapter = adapter;
    final response = await dio.get('me');
    expect(response.statusCode, 200);
    expect(adapter.requests, hasLength(2));
    expect(adapter.requests.last.extra['retried'], isTrue);
    expect(auth.refreshes, 1);
    expect(auth.signOuts, 0);
  });
  test('failed refresh signs out without retry', () async {
    final auth = _Auth()..canRefresh = false;
    final dio = createApiDio('https://example.com/api/v1', auth);
    final adapter = _Adapter((_) => 401);
    dio.httpClientAdapter = adapter;
    await expectLater(dio.get('me'), throwsA(isA<DioException>()));
    expect(adapter.requests, hasLength(1));
    expect(auth.refreshes, 1);
    expect(auth.signOuts, 1);
  });
  test('retry never loops on another 401', () async {
    final auth = _Auth();
    final dio = createApiDio('https://example.com/api/v1', auth);
    final adapter = _Adapter((_) => 401);
    dio.httpClientAdapter = adapter;
    await expectLater(dio.get('me'), throwsA(isA<DioException>()));
    expect(adapter.requests, hasLength(2));
    expect(auth.refreshes, 1);
    expect(auth.signOuts, 1);
  });
}
