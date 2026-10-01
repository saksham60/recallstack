import 'package:app/app/router.dart';
import 'package:app/core/reasonai/reasonai_events.dart';
import 'package:app/core/reasonai/reasonai_state.dart';
import 'package:app/core/reasonai/visual_lesson.dart';
import 'package:app/features/dsa/dsa_context.dart';
import 'package:app/features/dsa/dsa_models.dart';
import 'package:app/features/dsa/dsa_tutor_sheet.dart';
import 'package:app/features/feed/presentation/feed_models.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

Map<String, dynamic> story(String id, {String image = ''}) => {
  'id': id,
  'title': 'Title',
  'summary': 'Summary',
  'whyItMatters': 'Useful',
  'source': {'key': 'source', 'name': 'Source'},
  'sourceUrl': 'https://example.com/story',
  'imageUrl': image,
  'publishedAt': '2026-09-30T00:00:00Z',
  'topics': ['ai'],
  'importanceScore': 1,
  'qualityScore': 1,
  'viewerState': {'saved': false, 'seenAt': null},
};
void main() {
  test('feed parses backend story and keeps exact web context', () {
    final parsed = Story.parse(story('1'));
    expect(parsed.imageUrl, isNull);
    expect(parsed.raw, story('1'));
    final context = toReasonAIContext(parsed);
    expect(context['source'], {'key': 'source', 'name': 'Source'});
    expect(context['viewerState'], {'saved': false, 'seenAt': null});
    expect(context.keys, story('1').keys);
    final page = FeedPage.parse({
      'items': [
        story('1'),
        {'id': 2},
      ],
      'hasMore': false,
      'nextCursor': null,
    });
    expect(page.items, hasLength(1));
    expect(
      () => FeedPage.parse({
        'items': [story('1')],
        'hasMore': true,
        'nextCursor': null,
      }),
      throwsFormatException,
    );
  });
  test('auth redirect sends signed-in users to Feed', () {
    expect(
      authRedirect(null, Uri.parse('/story/abc')),
      '/login?from=%2Fstory%2Fabc',
    );
    final session = Session(
      accessToken: 'token',
      tokenType: 'bearer',
      user: const User(
        id: 'google-user',
        appMetadata: {},
        userMetadata: null,
        aud: 'authenticated',
        createdAt: '',
      ),
    );
    expect(
      authRedirect(
        session,
        Uri.parse('/login?from=%2Fdsa%2Fproblems%2Ftwo-sum'),
      ),
      '/feed',
    );
    expect(authRedirect(session, Uri.parse('/login')), '/feed');
    final anonymousSession = Session(
      accessToken: 'anonymous-token',
      tokenType: 'bearer',
      user: const User(
        id: 'judge-user',
        appMetadata: {},
        userMetadata: null,
        aud: 'authenticated',
        createdAt: '',
        isAnonymous: true,
      ),
    );
    expect(authRedirect(anonymousSession, Uri.parse('/login')), '/feed');
  });
  test(
    'event parser rejects malformed known events and ignores unknown types',
    () {
      final base = {'protocolVersion': 1, 'runId': 'run', 'seq': 1};
      expect(parseEvent({...base, 'type': 'future.type'}), isNull);
      expect(
        () => parseEvent({...base, 'type': 'text.delta'}),
        throwsA(isA<ProtocolError>()),
      );
      expect(
        () => parseEvent({'type': 'run.started'}),
        throwsA(isA<ProtocolError>()),
      );
    },
  );
  test('reducer keeps final text and completed history', () {
    final start = parseEvent({
      'protocolVersion': 1,
      'runId': 'run',
      'seq': 0,
      'type': 'run.started',
    })!;
    final delta = parseEvent({
      'protocolVersion': 1,
      'runId': 'run',
      'seq': 1,
      'type': 'text.delta',
      'messageId': 'a',
      'partId': 'p',
      'delta': 'Hel',
    })!;
    final done = parseEvent({
      'protocolVersion': 1,
      'runId': 'run',
      'seq': 2,
      'type': 'text.final',
      'messageId': 'a',
      'partId': 'p',
      'text': 'Hello',
    })!;
    final completed = parseEvent({
      'protocolVersion': 1,
      'runId': 'run',
      'seq': 3,
      'type': 'run.completed',
    })!;
    final state = reduce(
      reduce(reduce(reduce(const ChatState(), start), delta), done),
      completed,
    );
    expect(state.messages.single.text, 'Hello');
    expect(historyOf(state), [
      {'role': 'assistant', 'content': 'Hello'},
    ]);
  });
  test('visual parser defaults arrays and rejects bad geometry', () {
    final parsed = VisualLesson.tryParse({
      'title': 'Trace',
      'kind': 'array',
      'steps': [
        {'title': 'First', 'explanation': 'Look'},
      ],
    });
    expect(parsed!.steps.single.values, isEmpty);
    expect(
      VisualLesson.tryParse({
        'title': 'Graph',
        'kind': 'graph',
        'steps': [
          {
            'title': 'Bad',
            'explanation': 'x',
            'nodes': [
              {'id': 'a', 'x': 101, 'y': 3},
            ],
          },
        ],
      }),
      isNull,
    );
  });
  test('DSA context derives attribution and clamps user draft', () {
    final note = StudyNote.parse({
      'content_item_id': 'id',
      'slug': 'slug',
      'title': 'Title',
      'type': 'problem',
      'difficulty': 'medium',
      'summary': null,
      'categories': [
        {'name': 'Arrays'},
      ],
      'blocks': [
        {
          'type': 'recognize',
          'payload': {
            'text': 'Recognize this',
            'source': {'companies': 'Acme; Example', 'remarks': 'Popular'},
          },
        },
      ],
      'practice_resources': [
        {
          'provider_name': 'Practice',
          'url': 'javascript:bad',
          'is_primary': true,
        },
      ],
    });
    final context = buildDsaContext(note, approach: 'a' * 12001);
    expect(context['summary'], 'Recognize this');
    expect(context['companies'], ['Acme', 'Example']);
    expect(context.containsKey('sourceUrl'), isFalse);
    expect((context['userApproach'] as String).length, 12000);
  });
  test('DSA request contains only contract fields', () {
    final request = buildTutorRequest(
      action: 'hint',
      message: 'Hint',
      searchWeb: false,
      hintLevel: 1,
      context: {
        'contentId': 'id',
        'slug': 'slug',
        'title': 'Title',
        'userApproach': '',
        'userNotes': '',
        'userCode': '',
      },
      history: [],
      idempotencyKey: 'uuid',
    );
    expect(
      request.keys,
      containsAll([
        'action',
        'message',
        'searchWeb',
        'hintLevel',
        'context',
        'history',
        'idempotencyKey',
      ]),
    );
    expect(request.containsKey('visualFocus'), isFalse);
    expect(request['action'], 'hint');
    expect(mapDsaTutorAction('visualize'), DsaTutorAction.visualize);
    expect(mapDsaTutorAction('unknown'), DsaTutorAction.chat);
    expect(
      buildTutorRequest(
        action: 'unknown',
        message: 'Question',
        searchWeb: false,
        hintLevel: 0,
        context: request['context'] as Map<String, dynamic>,
        history: [],
        idempotencyKey: 'uuid',
      )['action'],
      'chat',
    );
  });

  test('history sends only the last 12 completed user and assistant texts', () {
    final messages = [
      for (var i = 0; i < 14; i++)
        ChatMessage(
          id: '$i',
          role: i.isEven ? 'user' : 'assistant',
          text: 'message $i',
          completed: true,
        ),
      const ChatMessage(
        id: 'tool',
        role: 'tool',
        text: 'internal',
        completed: true,
      ),
      const ChatMessage(id: 'draft', role: 'assistant', text: 'draft'),
    ];
    final history = historyOf(ChatState(messages: messages));
    expect(history, hasLength(12));
    expect(history.first, {'role': 'user', 'content': 'message 2'});
    expect(history.last, {'role': 'assistant', 'content': 'message 13'});
    expect(history.first.keys, ['role', 'content']);
  });
}
