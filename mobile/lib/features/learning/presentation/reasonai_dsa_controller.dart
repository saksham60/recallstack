import 'dart:async';
import 'package:app/core/reasonai/reasonai_client.dart';
import 'package:app/core/reasonai/reasonai_models.dart';
import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'reasonai_dsa_controller.g.dart';

@riverpod
class ReasonAIDSAController extends _$ReasonAIDSAController {
  CancelToken? _cancelToken;

  @override
  ReasonAIRuntimeState build(String contentId) {
    ref.onDispose(() {
      _cancelToken?.cancel();
    });
    return const ReasonAIRuntimeState();
  }

  Future<void> sendMessage(String text, {String? type}) async {
    if (text.trim().isEmpty && type == null) return;

    final actualText = type != null ? '[$type] $text' : text;

    final userMessage = ReasonAIRuntimeMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      role: 'user',
      status: ReasonAIMessageStatus.completed,
      parts: [
        ReasonAIMessagePart.text(
          partId: DateTime.now().millisecondsSinceEpoch.toString(),
          text: actualText,
          finalized: true,
        ),
      ],
    );

    state = state.copyWith(messages: [...state.messages, userMessage]);

    _cancelToken?.cancel();
    _cancelToken = CancelToken();

    final client = ref.read(reasonAIClientProvider);

    // In actual implementation, posts to /api/v1/knowledge/content/$contentId/chat
    final stream = client.streamReasonAI(
      endpoint: '/api/v1/knowledge/content/$contentId/chat',
      body: {
        'message': text,
        if (type != null) 'type': type,
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
  }
}
