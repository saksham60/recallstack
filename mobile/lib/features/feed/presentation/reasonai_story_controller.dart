import 'dart:async';
import 'package:app/core/reasonai/reasonai_client.dart';
import 'package:app/core/reasonai/reasonai_models.dart';
import 'package:app/core/reasonai/reasonai_reducer.dart';
import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'reasonai_story_controller.g.dart';

@riverpod
class ReasonAIStoryController extends _$ReasonAIStoryController {
  CancelToken? _cancelToken;

  @override
  ReasonAIRuntimeState build(String storyId) {
    ref.onDispose(() {
      _cancelToken?.cancel();
    });
    return const ReasonAIRuntimeState();
  }

  Future<void> sendMessage(String text) async {
    if (text.trim().isEmpty) return;

    // Append user message immediately
    final userMessage = ReasonAIRuntimeMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      role: 'user',
      status: ReasonAIMessageStatus.completed,
      parts: [
        ReasonAIMessagePart.text(
          partId: DateTime.now().millisecondsSinceEpoch.toString(),
          text: text,
          finalized: true,
        ),
      ],
    );

    state = state.copyWith(messages: [...state.messages, userMessage]);

    _cancelToken?.cancel();
    _cancelToken = CancelToken();

    final client = ref.read(reasonAIClientProvider);

    // In the actual system, this might post to `/api/v1/knowledge/stories/$storyId/chat`
    // We will stream from this hypothetical endpoint.
    final stream = client.streamReasonAI(
      endpoint: '/api/v1/knowledge/stories/$storyId/chat',
      body: {
        'message': text,
        'history': state.messages.map((m) => m.toJson()).toList(),
      },
      cancelToken: _cancelToken,
    );

    await for (final nextState in stream) {
      if (_cancelToken?.isCancelled ?? false) break;
      state = nextState;
    }
  }

  void cancel() {
    _cancelToken?.cancel();
    state = ReasonAIRuntimeReducer.interrupt(state); // We don't have direct access here, but client handles interrupt.
  }
}
