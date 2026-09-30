import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:app/core/api/api_client.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'reasonai_models.dart';
import 'reasonai_events.dart';
import 'reasonai_reducer.dart';

part 'reasonai_client.g.dart';

class ReasonAIClient {
  final ApiClient _apiClient;

  ReasonAIClient(this._apiClient);

  /// Streams a ReasonAI response and yields the accumulated state.
  Stream<ReasonAIRuntimeState> streamReasonAI({
    required String endpoint,
    required Map<String, dynamic> body,
    CancelToken? cancelToken,
  }) async* {
    var state = const ReasonAIRuntimeState();
    yield state;

    try {
      final response = await _apiClient.client.post<ResponseBody>(
        endpoint,
        data: body,
        cancelToken: cancelToken,
        options: Options(
          responseType: ResponseType.stream,
          headers: {'Accept': 'application/x-ndjson'},
        ),
      );

      final stream = response.data!.stream
          .cast<List<int>>()
          .transform(utf8.decoder)
          .transform(const LineSplitter());

      await for (final line in stream) {
        if (line.trim().isEmpty) continue;
        try {
          final json = jsonDecode(line) as Map<String, dynamic>;
          final event = ReasonAIEvent.fromJson(json);
          state = ReasonAIRuntimeReducer.reduce(state, event);
          yield state;
        } catch (e) {
          // Gracefully skip malformed events
        }
      }
    } on DioException catch (e) {
      if (CancelToken.isCancel(e)) {
        state = ReasonAIRuntimeReducer.interrupt(state);
      } else {
        state = state.copyWith(
          status: ReasonAIRunStatus.failed,
          error: ReasonAIRunError(message: 'Network error: ${e.message}'),
        );
      }
      yield state;
    } catch (e) {
      state = state.copyWith(
        status: ReasonAIRunStatus.failed,
        error: ReasonAIRunError(message: 'Unexpected error: $e'),
      );
      yield state;
    }
  }
}

@riverpod
ReasonAIClient reasonAIClient(Ref ref) {
  return ReasonAIClient(ref.watch(apiClientProvider));
}
