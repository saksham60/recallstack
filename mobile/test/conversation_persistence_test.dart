import 'package:app/core/reasonai/conversation_store.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'saved server conversation parts restore only bounded typed messages',
    () {
      final result = parseConversation({
        'messages': [
          {
            'id': 'message-1',
            'role': 'assistant',
            'status': 'completed',
            'parts': [
              {'type': 'text', 'text': 'Saved answer'},
              {
                'type': 'sources',
                'sources': [
                  {'title': 'Reference', 'url': 'https://example.com'},
                ],
              },
            ],
          },
        ],
      });
      expect(result.messages.single.text, 'Saved answer');
      expect(result.messages.single.completed, isTrue);
      expect(result.messages.single.sources.single['title'], 'Reference');
      expect(
        () => parseConversation({
          'messages': [
            {'id': 'bad', 'role': 'system', 'parts': []},
          ],
        }),
        throwsFormatException,
      );
    },
  );
}
