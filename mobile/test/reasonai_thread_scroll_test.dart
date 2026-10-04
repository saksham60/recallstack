import 'package:app/core/reasonai/reasonai_state.dart';
import 'package:app/core/reasonai/reasonai_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('streaming follows only while near the bottom', (tester) async {
    final messages = List.generate(
      10,
      (index) => ChatMessage(
        id: 'message-$index',
        role: index.isEven ? 'user' : 'assistant',
        text: 'Message $index ${'A longer explanation of the problem. ' * 8}',
        completed: true,
      ),
    );
    final chat = ValueNotifier(ChatState(messages: messages));
    addTearDown(chat.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            height: 360,
            child: ValueListenableBuilder<ChatState>(
              valueListenable: chat,
              builder: (_, state, _) => ReasonAIThread(state: state),
            ),
          ),
        ),
      ),
    );
    final list = find.byType(ListView);
    final scroll = tester.widget<ListView>(list).controller!;
    scroll.jumpTo(scroll.position.maxScrollExtent);
    await tester.pump();

    chat.value = chat.value.copy(
      messages: [
        ...chat.value.messages,
        const ChatMessage(id: 'answer', role: 'assistant', text: 'First token'),
      ],
      status: RunStatus.running,
    );
    await tester.pump();
    expect(scroll.offset, scroll.position.maxScrollExtent);

    await tester.drag(list, const Offset(0, 250));
    await tester.pump();
    final readingPosition = scroll.offset;
    expect(scroll.position.extentAfter, greaterThan(80));

    chat.value = chat.value.copy(
      messages: [
        ...chat.value.messages.take(chat.value.messages.length - 1),
        chat.value.messages.last.copy(
          text: 'First token ${'More explanation. ' * 30}',
        ),
      ],
      status: RunStatus.running,
    );
    await tester.pump();
    expect(scroll.offset, closeTo(readingPosition, 1));
    expect(find.text('Jump to latest'), findsOneWidget);

    await tester.tap(find.text('Jump to latest'));
    await tester.pump();
    await tester.pump();
    expect(scroll.offset, scroll.position.maxScrollExtent);
    expect(find.text('Jump to latest'), findsNothing);

    chat.value = chat.value.copy(
      messages: [
        ...chat.value.messages.take(chat.value.messages.length - 1),
        chat.value.messages.last.copy(
          text: 'First token ${'More explanation. ' * 40}',
        ),
      ],
      status: RunStatus.running,
    );
    await tester.pump();
    await tester.pump();
    expect(scroll.offset, scroll.position.maxScrollExtent);

    await tester.drag(list, const Offset(0, 250));
    await tester.pump();
    chat.value = chat.value.copy(
      messages: [
        ...chat.value.messages,
        const ChatMessage(
          id: 'new-question',
          role: 'user',
          text: 'My question',
        ),
      ],
      status: RunStatus.running,
    );
    await tester.pump();
    expect(scroll.offset, scroll.position.maxScrollExtent);
  });
}
