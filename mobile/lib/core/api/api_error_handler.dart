import 'dart:io';
import 'package:dio/dio.dart';

enum SyncErrorType {
  offline,
  authRequired,
  serverFailure,
  permanentFailure, // E.g., 400 Bad Request, 422 Unprocessable Entity
  conflict, // E.g., 409 Conflict
  unknown,
}

class ApiErrorHandler {
  static SyncErrorType classify(Object error) {
    if (error is DioException) {
      if (error.type == DioExceptionType.connectionTimeout ||
          error.type == DioExceptionType.receiveTimeout ||
          error.type == DioExceptionType.sendTimeout ||
          error.type == DioExceptionType.connectionError) {
        return SyncErrorType.offline;
      }

      if (error.error is SocketException) {
        return SyncErrorType.offline;
      }

      final statusCode = error.response?.statusCode;

      if (statusCode != null) {
        if (statusCode == 401 || statusCode == 403) {
          return SyncErrorType.authRequired;
        }
        if (statusCode == 409) {
          return SyncErrorType.conflict;
        }
        if (statusCode == 400 || statusCode == 422) {
          return SyncErrorType.permanentFailure;
        }
        if (statusCode >= 500 && statusCode <= 599) {
          return SyncErrorType.serverFailure;
        }
      }
    } else if (error is SocketException) {
      return SyncErrorType.offline;
    }

    return SyncErrorType.unknown;
  }
}
