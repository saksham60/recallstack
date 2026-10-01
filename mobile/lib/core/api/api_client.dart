import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../app/env.dart';
import '../auth/auth_repository.dart';

class AuthInterceptor extends Interceptor {
  AuthInterceptor(this.dio, this.auth);
  final Dio dio;
  final AuthRepository auth;
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final token = auth.current?.accessToken;
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode != 401) return handler.next(err);
    if (err.requestOptions.extra['retried'] == true) {
      try {
        await auth.signOut();
      } catch (_) {}
      return handler.next(err);
    }
    final refreshed = await auth.refreshSession();
    final newToken = auth.current?.accessToken;
    if (!refreshed || newToken == null) {
      try {
        await auth.signOut();
      } catch (_) {}
      return handler.next(err);
    }
    final original = err.requestOptions;
    final retry = original.copyWith(
      headers: {...original.headers, 'Authorization': 'Bearer $newToken'},
      extra: {...original.extra, 'retried': true},
    );
    try {
      handler.resolve(await dio.fetch<dynamic>(retry));
    } on DioException catch (failure) {
      handler.next(failure);
    }
  }
}

Dio createApiDio(String baseUrl, AuthRepository auth) {
  final dio = Dio(
    BaseOptions(
      baseUrl: baseUrl.endsWith('/') ? baseUrl : '$baseUrl/',
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
    ),
  );
  dio.interceptors.add(AuthInterceptor(dio, auth));
  return dio;
}

final backendDioProvider = Provider<Dio>(
  (ref) => createApiDio(AppEnv.apiBaseUrl, ref.watch(authRepositoryProvider)),
);
