import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../app/env.dart';
import '../auth/auth_repository.dart';

const feedReasonAIPath = '/api/reasonai/knowledge/chat';
const dsaReasonAIPath = '/api/reasonai/dsa/chat';

class ReasonAIAuthInterceptor extends Interceptor {
  ReasonAIAuthInterceptor(this.auth);
  final AuthRepository auth;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final accessToken = auth.current?.accessToken;
    if (accessToken == null || accessToken.isEmpty) {
      return handler.reject(
        DioException(
          requestOptions: options,
          type: DioExceptionType.badResponse,
          response: Response<dynamic>(
            requestOptions: options,
            statusCode: 401,
            data: {'error': 'Sign in to use ReasonAI.'},
          ),
        ),
      );
    }
    options.headers['Authorization'] = 'Bearer $accessToken';
    handler.next(options);
  }
}

class ReasonAICanonicalRedirectInterceptor extends Interceptor {
  ReasonAICanonicalRedirectInterceptor(this.dio);
  final Dio dio;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final original = err.requestOptions;
    final location = err.response?.headers.value('location');
    final redirected = location == null ? null : Uri.tryParse(location);
    final allowed =
        err.response?.statusCode == 308 &&
        original.uri.scheme == 'https' &&
        original.uri.host == 'reasonai.tech' &&
        original.extra['reasonaiCanonicalRetry'] != true &&
        redirected?.scheme == 'https' &&
        redirected?.host == 'www.reasonai.tech' &&
        redirected?.port == 443 &&
        redirected?.userInfo.isEmpty == true &&
        redirected?.path == original.uri.path &&
        redirected?.query == original.uri.query;
    if (!allowed) return handler.next(err);

    try {
      final retry = original.copyWith(
        path: redirected.toString(),
        extra: {...original.extra, 'reasonaiCanonicalRetry': true},
      );
      handler.resolve(await dio.fetch<dynamic>(retry));
    } on DioException catch (failure) {
      handler.next(failure);
    }
  }
}

Dio createReasonAIDio(String webBaseUrl, AuthRepository auth) {
  final uri = Uri.tryParse(webBaseUrl);
  if (uri == null ||
      !['http', 'https'].contains(uri.scheme) ||
      uri.host.isEmpty ||
      (uri.path.isNotEmpty && uri.path != '/')) {
    throw StateError('Missing or invalid WEB_BASE_URL for ReasonAI.');
  }
  final dio = Dio(
    BaseOptions(
      baseUrl: '${uri.origin}/',
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 120),
      headers: {
        'Accept': 'application/x-ndjson',
        'Content-Type': 'application/json',
      },
    ),
  );
  dio.interceptors.add(ReasonAIAuthInterceptor(auth));
  dio.interceptors.add(ReasonAICanonicalRedirectInterceptor(dio));
  return dio;
}

final reasonAIDioProvider = Provider<Dio>(
  (ref) =>
      createReasonAIDio(AppEnv.webBaseUrl, ref.watch(authRepositoryProvider)),
);
