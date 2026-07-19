import 'package:dio/dio.dart';

abstract class AppException implements Exception {
  final String message;
  final dynamic cause;

  AppException(this.message, [this.cause]);

  @override
  String toString() => message;
}

class AuthException extends AppException {
  AuthException([super.message = 'Authentication failed', super.cause]);
}

class AuthorizationException extends AppException {
  AuthorizationException([super.message = 'Not authorized to perform this action', super.cause]);
}

class NotFoundException extends AppException {
  NotFoundException([super.message = 'Resource not found', super.cause]);
}

class ConflictException extends AppException {
  ConflictException([super.message = 'A conflict occurred', super.cause]);
}

class ValidationException extends AppException {
  ValidationException([super.message = 'Validation failed', super.cause]);
}

class RateLimitException extends AppException {
  RateLimitException([super.message = 'Rate limit exceeded. Try again later.', super.cause]);
}

class ServerException extends AppException {
  ServerException([super.message = 'Server error occurred', super.cause]);
}

class NetworkException extends AppException {
  NetworkException([super.message = 'Network connection failed', super.cause]);
}

class TimeoutException extends AppException {
  TimeoutException([super.message = 'Request timed out', super.cause]);
}

class UnknownException extends AppException {
  UnknownException([super.message = 'An unknown error occurred', super.cause]);
}

class ErrorMapper {
  static AppException fromDioException(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
        return TimeoutException(e.message ?? 'Timeout', e);
      case DioExceptionType.connectionError:
        return NetworkException(e.message ?? 'Network Error', e);
      case DioExceptionType.badResponse:
        final statusCode = e.response?.statusCode;
        switch (statusCode) {
          case 400:
            return ValidationException('Validation failed', e);
          case 401:
            return AuthException('Unauthorized', e);
          case 403:
            return AuthorizationException('Forbidden', e);
          case 404:
            return NotFoundException('Not found', e);
          case 409:
            return ConflictException('Conflict', e);
          case 429:
            return RateLimitException('Rate limit exceeded', e);
          case 500:
          case 502:
          case 503:
          case 504:
            return ServerException('Server error: $statusCode', e);
          default:
            return UnknownException('Received status code: $statusCode', e);
        }
      case DioExceptionType.cancel:
      case DioExceptionType.badCertificate:
      case DioExceptionType.unknown:
        return UnknownException(e.message ?? 'Unknown Error', e);
    }
  }
}
