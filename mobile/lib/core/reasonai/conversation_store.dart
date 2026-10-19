import 'package:dio/dio.dart';
import '../db/app_database.dart';
import 'reasonai_state.dart';
import 'visual_lesson.dart';

class ConversationStore {
  const ConversationStore(this.db, this.dio);
  final AppDatabase db;
  final Dio dio;
  Future<String?> id(String key) => db.readRecord('conversation:$key');
  Future<void> remember(String key, String id) =>
      db.writeRecord('conversation:$key', id);
  Future<void> forget(String key) => db.deleteRecord('conversation:$key');
  Future<ChatState> load(
    String id,
    String contextId, {
    CancelToken? token,
  }) async {
    if (!RegExp(r'^[a-f0-9-]{36}$', caseSensitive: false).hasMatch(id)) {
      throw const FormatException('Invalid conversation ID.');
    }
    final response = await dio.get(
      'api/reasonai/conversations/${Uri.encodeComponent(id)}',
      cancelToken: token,
      options: Options(headers: {'Accept': 'application/json'}),
    );
    final body = Map<String, dynamic>.from(response.data as Map);
    final conversation = Map<String, dynamic>.from(body['conversation'] as Map);
    if (conversation['id'] != id ||
        conversation['surface'] != 'dsa' ||
        conversation['contextId'] != contextId) {
      throw const FormatException('Conversation context mismatch.');
    }
    return parseConversation(conversation);
  }
}

ChatState parseConversation(Map<String, dynamic> conversation) {
  final rows = (conversation['messages'] as List).whereType<Map>().toList();
  final messages = <ChatMessage>[];
  for (final row in rows.skip(rows.length > 80 ? rows.length - 80 : 0)) {
    if (!{'user', 'assistant'}.contains(row['role']) ||
        row['id'] is! String ||
        row['parts'] is! List) {
      throw const FormatException('Invalid conversation message.');
    }
    final parts = (row['parts'] as List).whereType<Map>().take(32);
    final text = parts
        .where((p) => p['type'] == 'text')
        .map((p) => p['text'])
        .whereType<String>()
        .join('\n');
    if (text.length > 64000) {
      throw const FormatException('Oversized conversation message.');
    }
    final sources = <Map<String, dynamic>>[], tools = <Map<String, dynamic>>[];
    VisualLesson? visual;
    for (final part in parts) {
      if (part['type'] == 'sources') {
        sources.addAll(
          (part['sources'] as List? ?? [])
              .whereType<Map>()
              .take(20)
              .map((s) => Map<String, dynamic>.from(s)),
        );
      }
      if (part['type'] == 'tool') tools.add(Map<String, dynamic>.from(part));
      if (part['type'] == 'visual') {
        visual = VisualLesson.tryParse(part['data']);
      }
    }
    messages.add(
      ChatMessage(
        id: row['id'] as String,
        role: row['role'] as String,
        text: text,
        completed: row['status'] == 'completed',
        sources: sources,
        tools: tools,
        visual: visual,
      ),
    );
  }
  return ChatState(messages: messages, status: RunStatus.idle);
}
