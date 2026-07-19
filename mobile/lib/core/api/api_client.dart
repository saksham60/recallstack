import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:app/core/auth/supabase_auth_repository.dart';

part 'api_client.g.dart';

class ApiClient {
  final Dio _dio;
  final SupabaseAuthRepository _authRepository;

  ApiClient(this._authRepository) : _dio = Dio() {
    final baseUrl = dotenv.env['API_BASE_URL'] ?? 'http://10.0.2.2:8080/api/v1';
    
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
          // Implement centralized error handling, mapping to Domain errors
          // Do not log tokens in error traces
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
