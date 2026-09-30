// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reasonai_story_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(ReasonAIStoryController)
final reasonAIStoryControllerProvider = ReasonAIStoryControllerFamily._();

final class ReasonAIStoryControllerProvider
    extends $NotifierProvider<ReasonAIStoryController, ReasonAIRuntimeState> {
  ReasonAIStoryControllerProvider._({
    required ReasonAIStoryControllerFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'reasonAIStoryControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$reasonAIStoryControllerHash();

  @override
  String toString() {
    return r'reasonAIStoryControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  ReasonAIStoryController create() => ReasonAIStoryController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ReasonAIRuntimeState value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ReasonAIRuntimeState>(value),
    );
  }

  @override
  bool operator ==(Object other) {
    return other is ReasonAIStoryControllerProvider &&
        other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$reasonAIStoryControllerHash() =>
    r'f8cee06323b484d1ad584b81f249c46d19bc3c7a';

final class ReasonAIStoryControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          ReasonAIStoryController,
          ReasonAIRuntimeState,
          ReasonAIRuntimeState,
          ReasonAIRuntimeState,
          String
        > {
  ReasonAIStoryControllerFamily._()
    : super(
        retry: null,
        name: r'reasonAIStoryControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  ReasonAIStoryControllerProvider call(String storyId) =>
      ReasonAIStoryControllerProvider._(argument: storyId, from: this);

  @override
  String toString() => r'reasonAIStoryControllerProvider';
}

abstract class _$ReasonAIStoryController
    extends $Notifier<ReasonAIRuntimeState> {
  late final _$args = ref.$arg as String;
  String get storyId => _$args;

  ReasonAIRuntimeState build(String storyId);
  @$mustCallSuper
  @override
  void runBuild() {
    final ref = this.ref as $Ref<ReasonAIRuntimeState, ReasonAIRuntimeState>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<ReasonAIRuntimeState, ReasonAIRuntimeState>,
              ReasonAIRuntimeState,
              Object?,
              Object?
            >;
    element.handleCreate(ref, () => build(_$args));
  }
}
