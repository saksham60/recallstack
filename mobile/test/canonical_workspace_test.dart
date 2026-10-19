import 'package:app/features/dsa/canonical_api.dart';
import 'package:app/features/dsa/canonical_models.dart';
import 'package:app/features/dsa/python_editor.dart';
import 'package:app/features/dsa/report_view.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'support/canonical_fixture.dart';

void main() {
  test(
    'Python accessory preserves selection and unindents the current line',
    () {
      final controller = PythonController(text: 'def solve(nums):\n    pass');
      addTearDown(controller.dispose);
      controller.selection = TextSelection.collapsed(
        offset: controller.text.length,
      );
      controller.unindent();
      expect(controller.text, 'def solve(nums):\npass');
      controller.selection = const TextSelection(
        baseOffset: 4,
        extentOffset: 9,
      );
      controller.insert('total');
      expect(controller.text, startsWith('def total'));
      expect(controller.selection.isCollapsed, isTrue);
    },
  );
  testWidgets(
    'mobile Python editor fits 320dp with keyboard, disabled autocorrection and horizontal code scrolling',
    (tester) async {
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final controller = PythonController(
        text: 'def solve(nums):\n    return sum(nums)',
      );
      addTearDown(controller.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: PythonEditor(controller: controller, onChanged: () {}),
          ),
        ),
      );
      final input = tester.widget<TextField>(find.byType(TextField));
      expect(input.autocorrect, isFalse);
      expect(input.enableSuggestions, isFalse);
      expect(input.smartQuotesType, SmartQuotesType.disabled);
      await tester.enterText(
        find.byType(TextField),
        'def solve(nums):\n    return ${'very_long_variable_' * 25}',
      );
      await tester.pump();
      await tester.tap(find.text('Tab'));
      await tester.pump();
      expect(controller.text.endsWith('    '), isTrue);
      expect(find.byTooltip('Undo'), findsOneWidget);
      expect(find.byTooltip('Redo'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'Submit result never renders case-level data and unknown counts are omitted',
    (tester) async {
      final data = executionFixture();
      data['result'] = {
        'verdict': 'accepted',
        'totalTests': 3,
        'publicCases': [
          {'input': 'HIDDEN_SENTINEL', 'stdout': 'PRIVATE_LOG'},
        ],
      };
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ExecutionCard(job: Execution.parse(data))),
        ),
      );
      expect(find.textContaining('HIDDEN_SENTINEL'), findsNothing);
      expect(find.textContaining('PRIVATE_LOG'), findsNothing);
      expect(find.textContaining('0/3'), findsNothing);
    },
  );
  testWidgets(
    'AI failure retry reuses saved submission and preserves judge result',
    (tester) async {
      final server = ContractServer()..reportStatus = 'failed';
      final dio = Dio(BaseOptions(baseUrl: 'https://fixture.test/'))
        ..httpClientAdapter = server;
      final api = CanonicalDsaApi(dio, dio);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SubmissionDetails(
              api: api,
              problem: Problem.parse(problemFixture()),
              initial: Execution.parse(executionFixture()),
              onDiscuss: (_, _) {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Retry AI Review'), findsOneWidget);
      expect(find.text('Accepted'), findsOneWidget);
      await tester.tap(find.text('Retry AI Review'));
      await tester.pumpAndSettle();
      expect(find.text('Fixture saved analysis'), findsOneWidget);
      expect(server.reportRetries, 1);
      expect(server.launches, 0);
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'queued saved AI reports poll to completion and dispose cleanly',
    (tester) async {
      final server = ContractServer()..reportStatus = 'queued';
      final dio = Dio(BaseOptions(baseUrl: 'https://fixture.test/'))
        ..httpClientAdapter = server;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SubmissionDetails(
              api: CanonicalDsaApi(dio, dio),
              problem: Problem.parse(problemFixture()),
              initial: Execution.parse(executionFixture()),
              onDiscuss: (_, _) {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Code Intelligence queued'), findsOneWidget);
      server.reportStatus = 'generating';
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      expect(find.text('Reviewing your solution…'), findsOneWidget);
      server.reportStatus = 'completed';
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      expect(find.text('Fixture saved analysis'), findsOneWidget);
      final count = server.requests.length;
      await tester.pump(const Duration(seconds: 5));
      expect(server.requests.length, count);
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
    },
  );
}
