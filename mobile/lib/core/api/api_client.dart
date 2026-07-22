import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:app/core/auth/supabase_auth_repository.dart';

part 'api_client.g.dart';

class ApiClient {
  final Dio _dio;
  final SupabaseAuthRepository _authRepository;

  ApiClient(this._authRepository) : _dio = Dio() {
    const dartDefineUrl = String.fromEnvironment('API_BASE_URL');
    final dotenvUrl = dotenv.env['API_BASE_URL'];
    
    String? baseUrl = dartDefineUrl.isNotEmpty ? dartDefineUrl : dotenvUrl;
    
    if (baseUrl == null || baseUrl.isEmpty) {
      throw UnsupportedError('API_BASE_URL must be provided');
    }
    
    _dio.options = BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          // Attach Supabase bearer token
          final token = await _authRepository.getAccessToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (DioException e, handler) {
          if (e.response?.statusCode == 401) {
            _authRepository.signOut();
          }
          return handler.next(e);
        },
      ),
    );
  }

  Dio get client => _dio;
}

@riverpod
ApiClient apiClient(Ref ref) {
  final authRepo = ref.watch(authRepositoryProvider);
  return ApiClient(authRepo);
}

@riverpod
Dio dio(Ref ref) {
  return ref.watch(apiClientProvider).client;
}
