// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'feed_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(FeedController)
final feedControllerProvider = FeedControllerProvider._();

final class FeedControllerProvider
    extends $AsyncNotifierProvider<FeedController, List<Story>> {
  FeedControllerProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'feedControllerProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$feedControllerHash();

  @$internal
  @override
  FeedController create() => FeedController();
}

String _$feedControllerHash() => r'a5153a3b9842d1538e2fd177d511c24cf7e9cee2';

abstract class _$FeedController extends $AsyncNotifier<List<Story>> {
  FutureOr<List<Story>> build();
  @$mustCallSuper
  @override
  void runBuild() {
    final ref = this.ref as $Ref<AsyncValue<List<Story>>, List<Story>>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<List<Story>>, List<Story>>,
              AsyncValue<List<Story>>,
              Object?,
              Object?
            >;
    element.handleCreate(ref, build);
  }
}

@ProviderFor(FeedCursor)
final feedCursorProvider = FeedCursorProvider._();

final class FeedCursorProvider extends $NotifierProvider<FeedCursor, String?> {
  FeedCursorProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'feedCursorProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$feedCursorHash();

  @$internal
  @override
  FeedCursor create() => FeedCursor();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(String? value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<String?>(value),
    );
  }
}

String _$feedCursorHash() => r'f8c03cfa891be2c134f617d73405547c4a948300';

abstract class _$FeedCursor extends $Notifier<String?> {
  String? build();
  @$mustCallSuper
  @override
  void runBuild() {
    final ref = this.ref as $Ref<String?, String?>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<String?, String?>,
              String?,
              Object?,
              Object?
            >;
    element.handleCreate(ref, build);
  }
}

@ProviderFor(FeedHasMore)
final feedHasMoreProvider = FeedHasMoreProvider._();

final class FeedHasMoreProvider extends $NotifierProvider<FeedHasMore, bool> {
  FeedHasMoreProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'feedHasMoreProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$feedHasMoreHash();

  @$internal
  @override
  FeedHasMore create() => FeedHasMore();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(bool value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<bool>(value),
    );
  }
}

String _$feedHasMoreHash() => r'ab78ad8fb4b89c1346b43a7a69f2f36e322245f7';

abstract class _$FeedHasMore extends $Notifier<bool> {
  bool build();
  @$mustCallSuper
  @override
  void runBuild() {
    final ref = this.ref as $Ref<bool, bool>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<bool, bool>,
              bool,
              Object?,
              Object?
            >;
    element.handleCreate(ref, build);
  }
}

@ProviderFor(StoryDetail)
final storyDetailProvider = StoryDetailFamily._();

final class StoryDetailProvider
    extends $AsyncNotifierProvider<StoryDetail, Story> {
  StoryDetailProvider._({
    required StoryDetailFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'storyDetailProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$storyDetailHash();

  @override
  String toString() {
    return r'storyDetailProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  StoryDetail create() => StoryDetail();

  @override
  bool operator ==(Object other) {
    return other is StoryDetailProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$storyDetailHash() => r'abaed72a8c3a213383146a4a1be0c67091b3e8f4';

final class StoryDetailFamily extends $Family
    with
        $ClassFamilyOverride<
          StoryDetail,
          AsyncValue<Story>,
          Story,
          FutureOr<Story>,
          String
        > {
  StoryDetailFamily._()
    : super(
        retry: null,
        name: r'storyDetailProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  StoryDetailProvider call(String id) =>
      StoryDetailProvider._(argument: id, from: this);

  @override
  String toString() => r'storyDetailProvider';
}

abstract class _$StoryDetail extends $AsyncNotifier<Story> {
  late final _$args = ref.$arg as String;
  String get id => _$args;

  FutureOr<Story> build(String id);
  @$mustCallSuper
  @override
  void runBuild() {
    final ref = this.ref as $Ref<AsyncValue<Story>, Story>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<Story>, Story>,
              AsyncValue<Story>,
              Object?,
              Object?
            >;
    element.handleCreate(ref, () => build(_$args));
  }
}
